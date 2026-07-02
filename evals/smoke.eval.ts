import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Smoke test: the agent responds helpfully and mentions eve.",
  async test(t) {
    await t.send("What are you built with?");
    t.completed();
    t.check(t.reply, includes("eve"));
  },
});
