from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SubjectListView, BookListView, RankingView,
    UserProfileView, BenefitsView, UseBenefitView, MatchViewSet
)

router = DefaultRouter()
router.register(r'matches', MatchViewSet, basename='match')

urlpatterns = [
    path("subjects/", SubjectListView.as_view(), name="subject-list"),
    path("subjects/<int:subject_id>/books/",
         BookListView.as_view(), name="book-list"),
    path("ranking/", RankingView.as_view(), name="ranking-general"),
    path("ranking/<int:subject_id>/", RankingView.as_view(), name="ranking-subject"),
    path("user/me/", UserProfileView.as_view(), name="user-profile"),
    path("user/me/benefits/", BenefitsView.as_view(), name="user-benefits"),
    path("user/me/benefits/<int:benefit_id>/use/", UseBenefitView.as_view(), name="use-benefit"),
    path("", include(router.urls)),
]
