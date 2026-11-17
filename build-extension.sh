#!/bin/sh
# Empaqueta la carpeta extension/ en gday-extension.zip (la que se descarga desde Ajustes).
# Correlo cada vez que cambies algo de la extensión, antes de publicar.
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
cp -R extension "$TMP/gday-extension"
find "$TMP" -name .DS_Store -delete
rm -f gday-extension.zip
(cd "$TMP" && zip -rq -X "$OLDPWD/gday-extension.zip" gday-extension)
rm -rf "$TMP"
echo "Listo: gday-extension.zip"
