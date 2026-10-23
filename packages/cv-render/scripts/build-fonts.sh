#!/usr/bin/env bash
# Rebuilds the CV fonts in ../fonts: static TTF instances from Google Fonts
# (the upstream of Fontsource, every family under the SIL Open Font License),
# subset to Fontsource's « latin » + « latin-ext » unicode ranges and written
# as WOFF without hinting (PDFs do not use it).
#
# WOFF, not WOFF2: fontkit (used by pdfkit to embed fonts) fails to subset
# WOFF2 composite glyphs. Requires fontTools (`pip install fonttools`) and curl.
# Not run by CI: the generated files are committed.
set -euo pipefail
cd "$(dirname "$0")/../fonts"

# Fontsource's latin and latin-ext ranges, merged.
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+20A0-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"

# family id | Google Fonts family name | styles (weight + i for italic) | OFL source
FAMILIES=(
  "inter|Inter|400,700,400i,700i|ofl/inter"
  "carlito|Carlito|400,700,400i,700i|ofl/carlito"
  "source-serif-4|Source Serif 4|400,700,400i,700i|ofl/sourceserif4"
  "source-sans-3|Source Sans 3|400,700,400i,700i|ofl/sourcesans3"
  "open-sans|Open Sans|400,700,400i,700i|ofl/opensans"
  "eb-garamond|EB Garamond|400,700,400i,700i|ofl/ebgaramond"
  "ibm-plex-sans|IBM Plex Sans|400,700,400i,700i|ofl/ibmplexsans"
  "playfair-display|Playfair Display|400,700|ofl/playfairdisplay"
  "montserrat|Montserrat|400,700|ofl/montserrat"
  "lora|Lora|400,700|ofl/lora"
  "poppins|Poppins|400,700|ofl/poppins"
)

# Without a browser user agent, the Google Fonts CSS API answers with one full TTF per style.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for entry in "${FAMILIES[@]}"; do
  IFS='|' read -r id name styles ofl <<<"$entry"
  css="$(curl -fsS "https://fonts.googleapis.com/css?family=${name// /+}:${styles}&subset=latin,latin-ext")"
  for style in ${styles//,/ }; do
    weight="${style%i}"
    if [[ "$style" == *i ]]; then italic="italic"; else italic="normal"; fi
    # The @font-face block of this weight and style, then its url(...).
    url="$(printf '%s' "$css" | tr -d '\n' | sed 's/}/}\n/g' \
      | grep "font-style: ${italic};" | grep "font-weight: ${weight};" \
      | sed -E 's/.*url\(([^)]+)\).*/\1/' | head -n 1)"
    curl -fsS -o "$TMP/src.ttf" "$url"
    pyftsubset "$TMP/src.ttf" --unicodes="$UNICODES" --flavor=woff --no-hinting \
      --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk' \
      --output-file="${id}-${weight}-${italic}.woff"
  done
  curl -fsS -o "LICENSE-${id}.txt" "https://raw.githubusercontent.com/google/fonts/main/${ofl}/OFL.txt"
  echo "${id}: done"
done
