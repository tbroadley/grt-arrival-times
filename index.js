#!/usr/bin/env node
const chalk = require("chalk");
const fs = require("fs");
const { render } = require("ink");
const path = require("path");
const h = require("react-hyperscript");
const tty = require("tty");

const { App } = require("./App");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

if (process.env.GRT_TTY) {
  chalk.enabled = true;
  chalk.level = 2;
}

const outputTTY = process.env.GRT_TTY
  ? new tty.WriteStream(fs.openSync(process.env.GRT_TTY, "r+"))
  : process.stdout;
const [width, height] = outputTTY.getWindowSize();

render(h(App, { width, height }), outputTTY);
