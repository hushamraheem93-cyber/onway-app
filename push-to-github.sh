#!/bin/bash
echo "Enter your GitHub token then press Enter:"
read -s TOKEN
echo "$TOKEN" | gh auth login --with-token
git push https://alobaidy93:${TOKEN}@github.com/alobaidy93/onway-app.git main
echo "Done!"
