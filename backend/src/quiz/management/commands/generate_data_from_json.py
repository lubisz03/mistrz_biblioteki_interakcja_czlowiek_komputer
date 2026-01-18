import json
import os
from django.core.management.base import BaseCommand
from django.conf import settings
from quiz.models import Subject, Book


class Command(BaseCommand):
    help = 'Generate subjects and books from books.json file. Only processes entries with PDF table of contents.'

    # Mapping kategorii na ikony Lucide i kolory
    CATEGORY_MAPPING = {
        'Automatyka': {'icon': 'settings', 'color': '#3B82F6'},  # blue
        'Chemia': {'icon': 'flask-conical', 'color': '#10B981'},  # green
        'Elektrotechnika': {'icon': 'zap', 'color': '#F59E0B'},  # amber
        'Fizyka': {'icon': 'atom', 'color': '#8B5CF6'},  # purple
        'Inzynieria Mechaniczna': {'icon': 'cog', 'color': '#EF4444'},  # red
        'Logistyka': {'icon': 'truck', 'color': '#06B6D4'},  # cyan
        'Marketing': {'icon': 'megaphone', 'color': '#EC4899'},  # pink
        'Matematyka': {'icon': 'calculator', 'color': '#6366F1'},  # indigo
        'Zarzadzanie': {'icon': 'briefcase', 'color': '#14B8A6'},  # teal
        'C++': {'icon': 'code', 'color': '#F97316'},  # orange
    }

    def add_arguments(self, parser):
        parser.add_argument(
            '--json-file',
            type=str,
            default='books.json',
            help='Path to JSON file (relative to project root)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing subjects and books before importing',
        )

    def handle(self, *args, **options):
        json_file = options['json_file']
        clear_existing = options['clear']

        # Ścieżka do pliku JSON
        # BASE_DIR wskazuje na src/, a books.json jest w src/books.json
        json_path = os.path.join(settings.BASE_DIR, json_file)

        if not os.path.exists(json_path):
            self.stdout.write(
                self.style.ERROR(f'File not found: {json_path}')
            )
            return

        # Czyszczenie istniejących danych jeśli wymagane
        if clear_existing:
            self.stdout.write(self.style.WARNING('Clearing existing data...'))
            Book.objects.all().delete()
            Subject.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Existing data cleared.'))

        # Wczytanie JSON
        self.stdout.write(f'Loading data from {json_path}...')
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                books_data = json.load(f)
        except json.JSONDecodeError as e:
            self.stdout.write(
                self.style.ERROR(f'Invalid JSON file: {e}')
            )
            return

        # Filtrowanie tylko książek z PDF w spis_tresci
        pdf_books = [
            book for book in books_data
            if book.get('spis_tresci', '').lower().endswith('.pdf')
        ]

        self.stdout.write(
            self.style.SUCCESS(
                f'Found {len(pdf_books)} books with PDF table of contents '
                f'(out of {len(books_data)} total)'
            )
        )

        # Zbieranie unikalnych kategorii
        categories = set(book['kategoria'] for book in pdf_books)
        self.stdout.write(f'Found {len(categories)} unique categories.')

        # Tworzenie lub aktualizacja Subject dla każdej kategorii
        subject_map = {}
        created_subjects = 0
        updated_subjects = 0

        for category in sorted(categories):
            mapping = self.CATEGORY_MAPPING.get(
                category,
                {'icon': 'book', 'color': '#6B7280'}  # default gray
            )

            subject, created = Subject.objects.get_or_create(
                name=category,
                defaults={
                    'color': mapping['color'],
                    'icon_name': mapping['icon'],
                }
            )

            if created:
                created_subjects += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Created subject: {category}')
                )
            else:
                # Aktualizuj kolor i ikonę jeśli istnieje
                if subject.color != mapping['color'] or subject.icon_name != mapping['icon']:
                    subject.color = mapping['color']
                    subject.icon_name = mapping['icon']
                    subject.save()
                    updated_subjects += 1
                    self.stdout.write(
                        self.style.WARNING(f'Updated subject: {category}')
                    )

            subject_map[category] = subject

        self.stdout.write(
            self.style.SUCCESS(
                f'\nSubjects: {created_subjects} created, '
                f'{updated_subjects} updated, '
                f'{len(subject_map)} total'
            )
        )

        # Tworzenie książek
        created_books = 0
        skipped_books = 0

        for book_data in pdf_books:
            category = book_data['kategoria']
            subject = subject_map[category]

            # Sprawdź czy książka już istnieje (po ISBN)
            isbn = book_data.get('isbn', '').strip()
            if not isbn:
                skipped_books += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipped book without ISBN: {book_data.get("tytul", "Unknown")}'
                    )
                )
                continue

            # Sprawdź czy książka już istnieje
            if Book.objects.filter(isbn=isbn).exists():
                skipped_books += 1
                continue

            # Utwórz książkę
            try:
                book = Book.objects.create(
                    title=book_data.get('tytul', '').strip(),
                    author=book_data.get('autor', '').strip(),
                    isbn=isbn,
                    subject=subject,
                    toc_pdf_url=book_data.get('spis_tresci', '').strip(),
                )
                created_books += 1

                if created_books % 10 == 0:
                    self.stdout.write(
                        f'Processed {created_books} books...'
                    )

            except Exception as e:
                skipped_books += 1
                self.stdout.write(
                    self.style.ERROR(
                        f'Error creating book {book_data.get("tytul", "Unknown")}: {e}'
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nBooks: {created_books} created, '
                f'{skipped_books} skipped'
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Import completed successfully!'
            )
        )
