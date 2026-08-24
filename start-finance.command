#!/bin/zsh

cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "Não foi possível encontrar o npm. Instala o Node.js 22 ou superior e tenta novamente."
  echo ""
  echo "Prime Enter para fechar."
  read -r
  exit 1
fi

npm run finance
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo ""
  echo "Não foi possível abrir o Prumo. Lê a mensagem acima e prime Enter para fechar."
  read -r
fi

exit "$exit_code"
