from django.contrib import admin
from .models import Subject, Book


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'color', 'icon_name']
    search_fields = ['name']
    list_filter = ['color']


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'isbn', 'subject', 'toc_pdf_url']
    search_fields = ['title', 'author', 'isbn']
    list_filter = ['subject']
