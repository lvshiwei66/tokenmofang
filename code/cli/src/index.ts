#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";

export function createProgram() {
  const program = new Command();

  program
    .name("tmf")
    .description("Token魔方 — 管理和切换本地 AI 应用的第三方 LLM 提供商")
    .version("0.1.0");

  return program;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const program = createProgram();
  program.parse();
}
