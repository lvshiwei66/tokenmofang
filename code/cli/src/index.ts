#!/usr/bin/env node
import { Command } from "commander";
import { registerTestCommand } from "./commands/test.js";

const program = new Command();

program
  .name("tmf")
  .description("Token魔方 — 管理和切换本地 AI 应用的 LLM 提供商")
  .version("0.1.0");

registerTestCommand(program);

program.parse();
