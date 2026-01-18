#!/bin/sh

echo "🚀 Starting Django in DEVELOPMENT mode..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
while ! pg_isready -h db -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres}; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "✅ PostgreSQL is ready!"

# Run migrations
echo "📦 Running migrations..."
python manage.py migrate --noinput

# Collect static files (needed for admin panel CSS)
echo "📁 Collecting static files..."
python manage.py collectstatic --noinput

# Create superuser if it doesn't exist (for development convenience)
echo "👤 Checking for superuser..."
python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(is_superuser=True).exists():
    print("Creating default superuser...")
    User.objects.create_superuser(
        username='admin',
        email='admin@example.com',
        password='admin123'
    ) if not User.objects.filter(username='admin').exists() else None
    print("Superuser created: admin/admin123")
else:
    print("Superuser already exists")
EOF

# Start Django ASGI server with auto-reload for WebSocket support
# Daphne is the ASGI server for Django Channels
echo "🔥 Starting Django ASGI server (Daphne) on 0.0.0.0:8000..."
daphne -b 0.0.0.0 -p 8000 src.asgi:application

