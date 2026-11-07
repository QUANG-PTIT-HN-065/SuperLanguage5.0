class AppException(Exception):
    def __init__(self, status_code: int, message: str, error_code: str = "APP_ERROR"):
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class AIServiceException(AppException):
    def __init__(self, message: str = "Hệ thống AI đang bận hoặc cạn kiệt hạn mức."):
        super().__init__(status_code=500, message=message, error_code="AI_SERVICE_ERROR")

class DatabaseException(AppException):
    def __init__(self, message: str = "Lỗi thao tác với cơ sở dữ liệu."):
        super().__init__(status_code=400, message=message, error_code="DATABASE_ERROR")