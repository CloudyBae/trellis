from pydantic import BaseModel


class ErrorBody(BaseModel):
    error: str


ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorBody},
    403: {"model": ErrorBody},
    413: {"model": ErrorBody},
    415: {"model": ErrorBody},
}
