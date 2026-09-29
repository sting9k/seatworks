import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The key an agent's tool server shows to say which agent calls: made from one secret per installation, so nothing
 * per agent is stored and a reopened session is given back the same key. It guards against mistakes, not intent.
 */
export class Keys {
  private readonly secret: Buffer;

  constructor(file: string) {
    if (existsSync(file)) this.secret = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    else {
      mkdirSync(dirname(file), { recursive: true });
      this.secret = randomBytes(32);
      writeFileSync(file, this.secret.toString("hex"), { mode: 0o600, flag: "wx" });
    }
  }

  keyOf(project: string, actor: string): string {
    return createHmac("sha256", this.secret).update(`${project}\0${actor}`).digest("hex");
  }

  holds(project: string, actor: string, key: string): boolean {
    const expected = Buffer.from(this.keyOf(project, actor), "hex");
    const given = Buffer.from(key, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
