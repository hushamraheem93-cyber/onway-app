#!/usr/bin/env bash
# OnWay — تشغيل الاختبار الشامل
# الاستخدام:
#   ./tests/run.sh           — جميع الاختبارات (API + Load + Stress)
#   ./tests/run.sh --api     — اختبارات API فقط (أسرع)
#   ./tests/run.sh --load    — API + Load
#   ./tests/run.sh --stress  — API + Stress

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   OnWay — نظام الاختبار الشامل          ║"
echo "╚══════════════════════════════════════════╝"

# التحقق من تشغيل الخادم
if ! curl -s --max-time 3 http://localhost:5000/api/categories > /dev/null 2>&1; then
  echo ""
  echo "  ✗ الخادم غير متاح على المنفذ 5000"
  echo "  → شغّل الخادم أولاً: npm run server:prod"
  exit 1
fi

cd "$ROOT_DIR"
node tests/run-tests.mjs "$@"
EXIT_CODE=$?

echo ""
if [ -f "$ROOT_DIR/tests/reports/latest.html" ]; then
  echo "  📄 افتح التقرير: tests/reports/latest.html"
fi

exit $EXIT_CODE
