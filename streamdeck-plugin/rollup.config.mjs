import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const sdPlugin = "com.shinsanghoon.claude-bridge.sdPlugin";

export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "esm",
    sourcemap: true,
  },
  external: ["@elgato/streamdeck"],
  plugins: [
    typescript({ tsconfig: "./tsconfig.json", noEmitOnError: true }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    // 'ws' 를 번들에 포함. 선택적 네이티브 가속 모듈은 무시(ws 가 런타임에 폴백).
    commonjs({ ignore: ["bufferutil", "utf-8-validate"] }),
  ],
};
