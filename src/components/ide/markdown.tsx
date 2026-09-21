import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

function inline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-md bg-white/8 px-1 py-0.5 font-mono text-[0.8em] text-sky-200"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/```[\w]*\n?|```/g)
  const nodes: ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (i % 2 === 1) {
      nodes.push(
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-200 ring-1 ring-white/8"
        >
          {block.replace(/\n$/, "")}
        </pre>
      )
      continue
    }
    const lines = block.split("\n")
    const paras: string[] = []
    let acc: string[] = []
    const flush = () => {
      if (acc.length) {
        paras.push(acc.join("\n"))
        acc = []
      }
    }
    for (const line of lines) {
      if (line.trim() === "") {
        flush()
        continue
      }
      acc.push(line)
    }
    flush()
    paras.forEach((p, j) => {
      const isList = p.split("\n").every((l) => /^\s*([-*]|\d+\.)\s/.test(l))
      if (isList) {
        nodes.push(
          <ul key={`${i}-${j}`} className="my-2 space-y-1 pl-4 text-[13.5px] leading-6">
            {p.split("\n").map((l, k) => (
              <li key={k} className="list-disc text-zinc-300">
                {inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}
              </li>
            ))}
          </ul>
        )
      } else if (p.startsWith("### ")) {
        nodes.push(
          <h3 key={`${i}-${j}`} className="mt-3 mb-1 text-[13px] font-medium text-zinc-100">
            {inline(p.slice(4))}
          </h3>
        )
      } else if (p.startsWith("---")) {
        nodes.push(<hr key={`${i}-${j}`} className="my-3 border-white/8" />)
      } else {
        nodes.push(
          <p key={`${i}-${j}`} className="my-1.5 text-[13.5px] leading-6 text-zinc-300 whitespace-pre-wrap">
            {inline(p)}
          </p>
        )
      }
    })
  }
  return <div className={cn("min-w-0", className)}>{nodes}</div>
}
