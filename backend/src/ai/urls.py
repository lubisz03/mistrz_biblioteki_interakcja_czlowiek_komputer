from django.urls import path
from .views import GenerateQuestionsView

urlpatterns = [
    path("<int:book_id>/generate-questions/",
         GenerateQuestionsView.as_view(), name="generate-questions"),
]
