#!/bin/bash
mkdir -p public
curl -L https://github.com/manuels/texlive.js/releases/download/v0.7.1/texlive.js -o public/texlive.js
curl -L https://github.com/manuels/texlive.js/releases/download/v0.7.1/texlive.wasm -o public/texlive.wasm