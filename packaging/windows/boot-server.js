"use strict"

const fs = require("fs")
const path = require("path")
const Module = require("module")

const root = __dirname
process.chdir(root)
process.env.NODE_ENV = "production"
process.env.PORT = process.env.PORT || "43147"
process.env.HOSTNAME = process.env.HOSTNAME || "127.0.0.1"
process.env.NODE_PATH = [
  path.join(root, "node_modules"),
  path.join(root, "node_modules", "next", "node_modules"),
].join(path.delimiter)
Module._initPaths()

const here = root.replace(/\\/g, "/")

function rewrite(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, "utf8")
  if (!text.includes("/workspace")) return
  fs.writeFileSync(file, text.split("/workspace").join(here))
}

rewrite("server.js")
rewrite(".next/required-server-files.json")

const need = ["@next/env", "styled-jsx", "next", "react"]
const missing = []
for (const name of need) {
  try {
    require.resolve(name)
  } catch {
    missing.push(name)
  }
}
if (missing.length) {
  console.error("Нет модулей: " + missing.join(", "))
  console.error("Нужен файл C:\\Artel\\app\\node_modules\\@next\\env\\package.json")
  console.error("Если получилось C:\\Artel\\Artel\\Artel.exe — это вложенная папка. Перенеси всё на уровень C:\\Artel\\")
  process.exit(1)
}

console.log(`Артель boot cwd=${root} port=${process.env.PORT}`)
require("./server.js")
