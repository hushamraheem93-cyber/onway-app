#!/bin/bash
echo "اكتب الـ token الخاص بك ثم اضغط Enter:"
read -s TOKEN
git remote remove github 2>/dev/null
git remote add github "https://alobaidy93:${TOKEN}@github.com/alobaidy93/onway-app.git"
git push github main
echo "تم!"
