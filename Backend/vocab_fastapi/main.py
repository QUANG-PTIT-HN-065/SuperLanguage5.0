from database import *
from service import *
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from datetime import datetime
from fastapi.encoders import jsonable_encoder
from fastapi import FastAPI,HTTPException,status,Request,Path,Query,Depends
app = FastAPI()

Base.metadata.create_all(bind = engine)

def get_db():
    db = LocalSession()
    try:
        yield db
    finally:
        db.close()


def create_response(
        status_code:int,
        message:str,
        error = None,
        data = None,
        path = ""
):
    return JSONResponse(
        status_code=status_code,
        content={
            "status_code": status_code,
            "message": message,
            "error": error,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
            "path": path
        }
    )

@app.exception_handler(RequestValidationError)

def request_validaiton_error(request:Request,exc:RequestValidationError):
    return create_response(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        message="Loi dinh dang du lieu vui long thu lai sau",
        error=exc.errors(),
        path=request.url.path
    )

@app.exception_handler(HTTPException)

def http_excxeption_handler(request:Request,exc:HTTPException):
    return create_response(
        status_code=exc.status_code,
        message=exc.detail,
        path = request.url.path
    )

@app.exception_handler(Exception)

def exception_handler(request:Request,exc:Exception):
    print(f"INTERNAL SERVER ERROR | Path: {request.url.path} {str(exc)}")
    return create_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="Loi he thong vui long thu lai sau",
        path=request.url.path
    )
@app.get("/vocab",tags=["Lay cac chu qua do kho hoac chu de"])
def take_words(request:Request,hardness:str = Query(None),topic_id:int = Query(None),db:Session = Depends(get_db)):
    information = take_words_through_topic_or_hardness(hardness,topic_id,db)
    if not information:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail = "Khong tim thay thong tin lien quan"
            )
    return create_response(
            status_code=status.HTTP_200_OK,
            message="Da tim thay thong tin",
            data = jsonable_encoder(information),
            path = request.url.path
        )
@app.get("/vocab/{language_id}",tags=["Lay topic qua id ngon ngu"])

def take_topics(request:Request,language_id :int = Path(...),db:Session = Depends(get_db)):
    information = take_topics_through_language_id(language_id,db)
    if not information:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail = "Khong tim thay thong tin lien quan"
        )
    return create_response(
        status_code=status.HTTP_200_OK,
        message="Da tim thay thong tin",
        data = jsonable_encoder(information),
        path = request.url.path
    )

@app.get("/lessons/{lesson_id}/questions",tags = ["Lay list cau hoi theo lesson id"])

def take_question (request:Request,lesson_id:int = Path(...),db:Session = Depends(get_db)):
    information = list_questions(lesson_id,db)
    if information is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail = "Khong tim thay lesson"
        )
    return create_response(
        status_code=status.HTTP_200_OK,
        message="Da tim thay thong tin",
        data = jsonable_encoder(information),
        path = request.url.path
    )