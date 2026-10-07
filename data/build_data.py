"""Build player pools for Sweep the Dodgers from the Lahman database.

Ratings are hidden from players in the app:
  hitters  -> park-adjusted OPS+ from the player's best qualifying season
  pitchers -> park-adjusted ERA+ (relievers regressed toward 100 by innings)
Output: pools.json (franchise x decade -> players) and dodgers.json (opponent).
"""
import json
import sys
import pandas as pd

DATA = sys.argv[1]
OUT = sys.argv[2]

def rd(name):
    return pd.read_parquet(f"{DATA}/{name}.parquet")

people = rd("People").set_index("playerID")
bat = rd("Batting")
pit = rd("Pitching")
app = rd("Appearances")
teams = rd("Teams")
fr = rd("TeamsFranchises")

# Earliest season in the game: fans know players from the 1960s on.
FIRST_YEAR = 1960

MLB_LGS = {"AL", "NL"}
teams = teams[teams.lgID.isin(MLB_LGS)]
team_info = teams.set_index(["yearID", "teamID"])[["franchID", "name", "BPF", "PPF", "G"]]

for c in ["HBP", "SF", "IBB", "SH"]:
    bat[c] = bat[c].fillna(0)
bat = bat[bat.lgID.isin(MLB_LGS)]
pit = pit[pit.lgID.isin(MLB_LGS)]

# ---------- league averages ----------
bat["TB"] = bat.H + bat["2B"] + 2 * bat["3B"] + 3 * bat.HR
lg = bat.groupby(["yearID", "lgID"])[["H", "BB", "HBP", "AB", "SF", "TB"]].sum()
lg["OBP"] = (lg.H + lg.BB + lg.HBP) / (lg.AB + lg.BB + lg.HBP + lg.SF)
lg["SLG"] = lg.TB / lg.AB
lgp = pit.groupby(["yearID", "lgID"])[["ER", "IPOuts"]].sum()
lgp["ERA"] = 27 * lgp.ER / lgp.IPOuts

# ---------- hitter seasons (per player-year-team) ----------
hb = bat.groupby(["playerID", "yearID", "teamID", "lgID"])[["G", "AB", "H", "BB", "HBP", "SF", "TB", "HR"]].sum().reset_index()
hb["PA"] = hb.AB + hb.BB + hb.HBP + hb.SF
hb = hb.join(team_info.rename(columns={"G": "TG"}), on=["yearID", "teamID"], how="inner")
hb = hb.join(lg[["OBP", "SLG"]].rename(columns={"OBP": "lOBP", "SLG": "lSLG"}), on=["yearID", "lgID"])
hb["OBP"] = (hb.H + hb.BB + hb.HBP) / (hb.AB + hb.BB + hb.HBP + hb.SF)
hb["SLG"] = hb.TB / hb.AB
hb["rating"] = 100 * (hb.OBP / hb.lOBP + hb.SLG / hb.lSLG - 1) / (hb.BPF / 100)

ap = app.groupby(["playerID", "yearID", "teamID"]).sum(numeric_only=True)
POS = {"G_c": "C", "G_1b": "1B", "G_2b": "2B", "G_3b": "3B", "G_ss": "SS",
       "G_lf": "LF", "G_cf": "CF", "G_rf": "RF", "G_dh": "DH"}
apos = ap[list(POS)].idxmax(axis=1).map(POS)
pitcher_mostly = ap.G_p > ap.G_all / 2
hb = hb.join(apos.rename("pos"), on=["playerID", "yearID", "teamID"])
hb = hb.join(pitcher_mostly.rename("isP"), on=["playerID", "yearID", "teamID"])
hb = hb[(hb.isP != True)]

# career eligibility: every field position a player logged 20+ games at
FIELD = {"G_c": "C", "G_1b": "1B", "G_2b": "2B", "G_3b": "3B", "G_ss": "SS",
         "G_lf": "LF", "G_cf": "CF", "G_rf": "RF"}
career = app.groupby("playerID")[list(FIELD) + ["G_of"]].sum()
no_split = (career[["G_lf", "G_cf", "G_rf"]].sum(axis=1) == 0) & (career.G_of > 0)
for c in ["G_lf", "G_cf", "G_rf"]:
    career.loc[no_split, c] = career.loc[no_split, "G_of"]

def eligible(pid, primary):
    if pid not in career.index:
        return [primary] if primary in FIELD.values() else []
    row = career.loc[pid, list(FIELD)].sort_values(ascending=False)
    pos = [FIELD[c] for c, g in row.items() if g >= 20]
    if primary in FIELD.values() and primary not in pos:
        pos.insert(0, primary)
    if primary in pos:
        pos.remove(primary)
        pos.insert(0, primary)
    return pos  # empty = designated hitter only
hb = hb[hb.PA >= 400 * hb.TG / 162]  # scales for short seasons (e.g. 2020)

# ---------- pitcher seasons ----------
pp = pit.groupby(["playerID", "yearID", "teamID", "lgID"])[["G", "GS", "SV", "IPOuts", "ER"]].sum().reset_index()
pp = pp.join(team_info.rename(columns={"G": "TG"}), on=["yearID", "teamID"], how="inner")
pp = pp.join(lgp[["ERA"]].rename(columns={"ERA": "lERA"}), on=["yearID", "lgID"])
pp["IP"] = pp.IPOuts / 3
pp["ERA"] = (27 * pp.ER / pp.IPOuts).clip(lower=0.6)
pp["eraplus"] = (100 * pp.lERA * (pp.PPF / 100) / pp.ERA).clip(upper=300)
scale = pp.TG / 162
sp = pp[(pp.GS >= 20 * scale) & (pp.IP >= 150 * scale)].copy()
sp["rating"] = 100 + (sp.eraplus - 100) * sp.IP / (sp.IP + 40)
rp = pp[(pp.GS <= 3) & (pp.IP >= 40 * scale) & (pp.G >= 30 * scale)].copy()
rp["rating"] = 100 + (rp.eraplus - 100) * rp.IP / (rp.IP + 30)

def name_of(pid):
    r = people.loc[pid]
    return f"{r.nameFirst} {r.nameLast}"

def decade(y):
    return int(y // 10 * 10)

active = set(fr[fr.active == "Y"].franchID)

def best(df, role, posfn):
    df = df[df.franchID.isin(active) & (df.yearID >= FIRST_YEAR)].copy()
    df["decade"] = df.yearID.map(decade)
    df = df.sort_values("rating", ascending=False).drop_duplicates(["playerID", "franchID", "decade"])
    rows = []
    for r in df.itertuples():
        rows.append({"franchID": r.franchID, "decade": r.decade, "playerID": r.playerID,
                     "bbref": people.loc[r.playerID].bbrefID, "name": name_of(r.playerID),
                     "role": role, "pos": posfn(r), "rating": round(float(r.rating), 1),
                     "year": int(r.yearID), "sv": int(getattr(r, "SV", 0) or 0),
                     "positions": eligible(r.playerID, posfn(r)) if role == "H" else []})
    return pd.DataFrame(rows)

H = best(hb, "H", lambda r: r.pos if isinstance(r.pos, str) else "OF")
S = best(sp, "SP", lambda r: "SP")
R = best(rp, "RP", lambda r: "RP")

# team display name: most common name for the franchise in that decade
tn = teams[teams.franchID.isin(active) & (teams.yearID >= FIRST_YEAR)].copy()
tn["decade"] = tn.yearID.map(decade)
seasons = tn.groupby(["franchID", "decade"]).size()
disp = tn.groupby(["franchID", "decade"]).name.agg(lambda s: s.value_counts().index[0])

pools = []
for (fid, dec), n in seasons.items():
    if n < 4:
        continue
    h = H[(H.franchID == fid) & (H.decade == dec)].head(16)
    s = S[(S.franchID == fid) & (S.decade == dec)].head(8)
    r = R[(R.franchID == fid) & (R.decade == dec)].sort_values(["sv", "rating"], ascending=False).head(6)
    players = pd.concat([h, s, r])
    if len(h) < 5 or len(s) < 2:
        continue
    pools.append({
        "id": f"{fid}-{dec}",
        "team": disp[(fid, dec)],
        "decade": dec,
        "players": [
            {"id": f"{p.playerID}-{p.role}", "name": p.name, "pos": p.pos, "role": p.role,
             "positions": p.positions, "bbref": p.bbref, "rating": p.rating}
            for p in players.itertuples()
        ],
    })

# ---------- 2026 Dodgers (rated on 2025 seasons, any team) ----------
def lookup(first, last):
    m = people[(people.nameLast == last) & (people.nameFirst == first)]
    return [pid for pid in m.index if ((bat.playerID == pid) & (bat.yearID == 2025)).any()
            or ((pit.playerID == pid) & (pit.yearID == 2025)).any()]

def h2025(first, last, pos):
    pid = lookup(first, last)[0]
    d = hb_all[(hb_all.playerID == pid) & (hb_all.yearID == 2025)]
    t = d[["AB", "H", "BB", "HBP", "SF", "TB"]].sum()
    l = lg.loc[(2025, d.lgID.iloc[0])]
    bpf = (d.BPF * d.PA).sum() / d.PA.sum()
    obp = (t.H + t.BB + t.HBP) / (t.AB + t.BB + t.HBP + t.SF)
    slg = t.TB / t.AB
    rating = 100 * (obp / l.OBP + slg / l.SLG - 1) / (bpf / 100)
    pa = t.AB + t.BB + t.HBP + t.SF
    rating = 100 + (rating - 100) * pa / (pa + 100)  # regress small samples
    return {"id": pid, "name": f"{first} {last}", "pos": pos, "positions": eligible(pid, pos), "bbref": people.loc[pid].bbrefID,
            "rating": round(float(rating), 1)}

def p2025(first, last, starter):
    pid = lookup(first, last)[0]
    d = pp_all[(pp_all.playerID == pid) & (pp_all.yearID == 2025)]
    ip = d.IP.sum()
    era = max(27 * d.ER.sum() / d.IPOuts.sum(), 0.6)
    lera = (d.lERA * d.IP).sum() / ip
    ppf = (d.PPF * d.IP).sum() / ip
    eplus = min(100 * lera * (ppf / 100) / era, 300)
    k = 40 if starter else 30
    rating = 100 + (eplus - 100) * ip / (ip + k)
    return {"id": pid, "name": f"{first} {last}", "pos": "SP" if starter else "RP",
            "bbref": people.loc[pid].bbrefID, "rating": round(float(rating), 1), "ip": round(float(ip), 1)}

# unfiltered season tables for the opponent lookups
hb_all = bat.groupby(["playerID", "yearID", "teamID", "lgID"])[["AB", "H", "BB", "HBP", "SF", "TB"]].sum().reset_index()
hb_all["PA"] = hb_all.AB + hb_all.BB + hb_all.HBP + hb_all.SF
hb_all = hb_all.join(team_info[["BPF"]], on=["yearID", "teamID"], how="inner")
pp_all = pp

lineup = [("Shohei", "Ohtani", "DH"), ("Mookie", "Betts", "SS"), ("Freddie", "Freeman", "1B"),
          ("Will", "Smith", "C"), ("Kyle", "Tucker", "RF"), ("Max", "Muncy", "3B"),
          ("Teoscar", "Hernandez", "LF"), ("Andy", "Pages", "CF"), ("Tommy", "Edman", "2B")]
rotation = [("Yoshinobu", "Yamamoto"), ("Tarik", "Skubal"), ("Blake", "Snell"), ("Tyler", "Glasnow")]
closer = ("Edwin", "Diaz")
pen = [("Tanner", "Scott"), ("Alex", "Vesia"), ("Edgardo", "Henriquez"), ("Roki", "Sasaki"),
       ("Kris", "Bubic"), ("Brock", "Stewart"), ("Evan", "Phillips")]

lineup_out = []
for f, l, pos in lineup:
    try:
        x = h2025(f, l, pos)
    except (IndexError, KeyError):
        print("missing hitter", f, l, file=sys.stderr)
        continue
    if f == "Teoscar":
        x["name"] = "Teoscar Hernández"
    lineup_out.append(x)
rot_out = [p2025(f, l, True) for f, l in rotation]
cl = p2025(*closer, False)
cl["name"] = "Edwin Díaz"
pen_out = []
for f, l in pen:
    try:
        pen_out.append(p2025(f, l, False))
    except (IndexError, KeyError, ZeroDivisionError):
        print("missing reliever", f, l, file=sys.stderr)
pen_rating = sum(p["rating"] * p["ip"] for p in pen_out) / sum(p["ip"] for p in pen_out)

dodgers = {"lineup": lineup_out, "rotation": rot_out, "closer": cl,
           "bullpen": round(pen_rating, 1),
           "pen": sorted(pen_out, key=lambda p: -p["rating"])}

with open(f"{OUT}/pools.json", "w") as fh:
    json.dump(pools, fh, separators=(",", ":"), ensure_ascii=False)
with open(f"{OUT}/dodgers.json", "w") as fh:
    json.dump(dodgers, fh, indent=1, ensure_ascii=False)

print("pools", len(pools), "players", sum(len(p["players"]) for p in pools))
print(json.dumps(dodgers, indent=1, ensure_ascii=False))
