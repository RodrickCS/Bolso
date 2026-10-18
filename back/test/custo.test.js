import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCustoUsd } from "../src/ia/cliente.js";

test("custo da IA conta gravação (1,25x) e leitura do cache (bem mais barata)", () => {
  const semCache = calcularCustoUsd("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100 });
  assert.equal(semCache.custoUsd, (1000 * 2 + 100 * 10) / 1e6);

  const gravando = calcularCustoUsd("claude-sonnet-5-5", { input_tokens: 200, cache_creation_input_tokens: 800, output_tokens: 100 });
  assert.equal(gravando.tokensEntrada, 1000);
  assert.equal(gravando.custoUsd, (200 * 2 + 800 * 2 * 1.25 + 100 * 10) / 1e6);

  const lendo = calcularCustoUsd("claude-sonnet-5-5", { input_tokens: 200, cache_read_input_tokens: 800, output_tokens: 100 });
  assert.equal(lendo.custoUsd, (200 * 2 + 800 * 0.2 + 100 * 10) / 1e6);
  assert.ok(lendo.custoUsd < semCache.custoUsd);
});
