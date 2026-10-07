import { redirect } from "next/navigation";

/** A share link that lost its code (for example, cut off by a messaging app) lands on the game. */
export default function NoResult() {
  redirect("/");
}
