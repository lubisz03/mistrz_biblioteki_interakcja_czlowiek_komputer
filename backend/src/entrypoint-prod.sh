#!/bin/bash
set -e

echo "🚀 Starting Django in PRODUCTION mode..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
while ! pg_isready -h db -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres}; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "✅ PostgreSQL is ready!"

# Collect static files
echo "📦 Collecting static files..."
python manage.py collectstatic --noinput

# Run migrations
echo "🔄 Running migrations..."
python manage.py migrate --noinput

# Start Gunicorn
echo "🔥 Starting Gunicorn server..."
exec gunicorn src.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --threads 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --log-level info

