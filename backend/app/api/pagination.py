from typing import Annotated, Generic, List, TypeVar

from fastapi import Depends
from pydantic import BaseModel
from tortoise.models import Model as TortoiseModel
from tortoise.queryset import QuerySet

T = TypeVar("T", bound=BaseModel)
M = TypeVar("M", bound=TortoiseModel)


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Generic model for paginated responses.
    """

    items: List[T]
    total: int
    page: int
    size: int


class PaginationParamsModel(BaseModel):
    """
    Model for pagination parameters.
    """

    page: int
    size: int

    @property
    def offset(self) -> int:
        """
        Calculate the offset for pagination.
        """
        return (self.page - 1) * self.size if self.size > 0 else 0

    def apply(self, queryset: QuerySet[M]) -> QuerySet[M]:
        """
        Update the queryset with pagination parameters.
        """
        if self.page > 1:
            queryset = queryset.offset(self.offset)
        if self.size > 0:
            queryset = queryset.limit(self.size)
        return queryset


def get_pagination_params(
    page: int = 1,
    size: int = -1,
) -> PaginationParamsModel:
    """
    Dependency to get pagination parameters.
    """
    return PaginationParamsModel(page=page, size=size)


PaginationParams = Annotated[PaginationParamsModel, Depends(get_pagination_params)]
