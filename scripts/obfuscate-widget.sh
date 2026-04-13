#!/usr/bin/env bash
set -euo pipefail

INPUT_FILE="scripts/mt-chatbot-widget.js"
OUTPUT_FILE="scripts/mt-chatbot-widget.min.js"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "No se encontro el archivo de entrada: $INPUT_FILE"
  exit 1
fi

echo "Ofuscando $INPUT_FILE -> $OUTPUT_FILE ..."

npx --yes javascript-obfuscator "$INPUT_FILE" \
  --output "$OUTPUT_FILE" \
  --compact true \
  --control-flow-flattening true \
  --control-flow-flattening-threshold 0.75 \
  --dead-code-injection true \
  --dead-code-injection-threshold 0.4 \
  --identifier-names-generator hexadecimal \
  --rename-globals false \
  --string-array true \
  --string-array-encoding base64 \
  --string-array-threshold 0.8 \
  --transform-object-keys true \
  --unicode-escape-sequence false

echo "Listo. Archivo generado: $OUTPUT_FILE"
