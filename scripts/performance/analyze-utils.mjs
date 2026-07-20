import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { analyzeDir } from "./shared.mjs";

export const criticalRoutes = [
  { route: "/", dataPath: ["data", "analyze.data"] },
  { route: "/solicitud", dataPath: ["data", "solicitud", "analyze.data"] },
  { route: "/estado", dataPath: ["data", "estado", "analyze.data"] },
  { route: "/dashboard", dataPath: ["data", "dashboard", "analyze.data"] },
  {
    route: "/dashboard/pedidos",
    dataPath: ["data", "dashboard", "pedidos", "analyze.data"],
  },
  {
    route: "/dashboard/pedidos/[id]",
    dataPath: ["data", "dashboard", "pedidos", "[id]", "analyze.data"],
  },
  {
    route: "/dashboard/solicitudes",
    dataPath: ["data", "dashboard", "solicitudes", "analyze.data"],
  },
  {
    route: "/dashboard/solicitudes/[id]",
    dataPath: ["data", "dashboard", "solicitudes", "[id]", "analyze.data"],
  },
];

export const analyzerWarning =
  "Next analyzer graph bytes are build graph sizes, not browser network transfer bytes.";

export function extractJsonPrefix(buffer) {
  const start = buffer.indexOf(0x7b);

  if (start === -1) {
    throw new Error("Analyzer data does not contain a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < buffer.length; index += 1) {
    const char = String.fromCharCode(buffer[index]);

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return buffer.subarray(start, index + 1).toString("utf8");
      }
    }
  }

  throw new Error("Analyzer data JSON prefix is incomplete.");
}

export function normalizeSource(source) {
  return String(source || "")
    .replaceAll("\\", "/")
    .replaceAll("//", "/")
    .replace(/^\[project\]\//, "")
    .replace(/^\[client-fs\]\//, "");
}

export function sourcePath(sources, index) {
  const parts = [];
  const seen = new Set();
  let currentIndex = index;

  while (
    Number.isInteger(currentIndex) &&
    currentIndex >= 0 &&
    currentIndex < sources.length &&
    !seen.has(currentIndex)
  ) {
    seen.add(currentIndex);
    const source = sources[currentIndex];

    if (source?.path) {
      parts.push(source.path);
    }

    currentIndex = source?.parent_source_index;
  }

  const normalized = normalizeSource(parts.reverse().join("/"));

  if (!normalized) {
    throw new Error(`Unable to resolve analyzer source for index ${index}.`);
  }

  return normalized;
}

export function readRoutePayload(routeConfig) {
  const dataFile = join(analyzeDir, ...routeConfig.dataPath);

  if (!existsSync(dataFile)) {
    return {
      route: routeConfig.route,
      missing: true,
      relativeDataFile: relative(analyzeDir, dataFile).replaceAll("\\", "/"),
    };
  }

  const payload = JSON.parse(extractJsonPrefix(readFileSync(dataFile)));
  const parts = Array.isArray(payload.chunk_parts) ? payload.chunk_parts : [];
  const outputs = Array.isArray(payload.output_files) ? payload.output_files : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];

  if (!parts.length || !outputs.length || !sources.length) {
    throw new Error(
      `Unexpected analyzer format for ${routeConfig.route}: missing chunk_parts/output_files/sources.`,
    );
  }

  return { route: routeConfig.route, parts, outputs, sources };
}

export function summarizeSide(parts, outputs, sources, sidePrefix) {
  const bySource = new Map();
  let bytes = 0;

  for (const part of parts) {
    const output = outputs[part.output_file_index];
    const filename = String(output?.filename ?? "");

    if (!filename.startsWith(sidePrefix)) {
      continue;
    }

    const size = Number(part.size);
    const compressedSize = Number(part.compressed_size);

    if (!Number.isFinite(size) || !Number.isFinite(compressedSize)) {
      throw new Error(`Unexpected analyzer part size for ${filename}.`);
    }

    const source = sourcePath(sources, part.source_index);
    const current = bySource.get(source) ?? {
      source,
      bytes: 0,
      compressedBytes: 0,
      count: 0,
    };

    current.bytes += size;
    current.compressedBytes += compressedSize;
    current.count += 1;
    bySource.set(source, current);
    bytes += size;
  }

  const topSources = [...bySource.values()]
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 15);

  return { bytes, sourceCount: bySource.size, bySource, topSources };
}

export function loadRouteGraph(routeConfig) {
  const payload = readRoutePayload(routeConfig);

  if (payload.missing) {
    return payload;
  }

  const client = summarizeSide(
    payload.parts,
    payload.outputs,
    payload.sources,
    "[client-fs]",
  );
  const server = summarizeSide(
    payload.parts,
    payload.outputs,
    payload.sources,
    "[output]",
  );

  if (client.sourceCount === 0) {
    throw new Error(`Analyzer produced an empty client graph for ${payload.route}.`);
  }

  return {
    route: payload.route,
    clientGraphBytes: client.bytes,
    serverGraphBytes: server.bytes,
    sourceCount: client.sourceCount + server.sourceCount,
    clientSourceCount: client.sourceCount,
    serverSourceCount: server.sourceCount,
    clientSources: client.bySource,
    topClientSources: client.topSources,
    topServerSources: server.topSources,
  };
}
