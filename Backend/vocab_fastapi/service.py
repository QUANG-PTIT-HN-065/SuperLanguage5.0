from database import *
from sqlalchemy.orm import Session
from model import *

def take_topics_through_language_id(language_id: int, db:Session):
    information = db.query(Topic).filter(Topic.language_id==language_id).all()
    if not information:
        return None
    else:
        return information

def take_words_through_topic_or_hardness(hardness:str,topic_id:int,db:Session):
    if hardness is None and topic_id is not None:
        information = db.query(Word_and_topic).filter(Word_and_topic.topic_id == topic_id).all()
    elif hardness is not None and topic_id is None:
        information = db.query(Word).filter(Word.hardness_ranking==hardness).all()
    elif hardness is not None and topic_id is not None:
        information  = db.query(Word).join(Word_and_topic,Word.id==Word_and_topic.word_id).filter(Word.hardness_ranking==hardness,Word_and_topic.topic_id==topic_id).all()
    else:
        return None
    return information

def list_questions(lesson_id:int,db:Session):
    lst = []
    information = db.query(Lessons).filter(Lessons.id==lesson_id).first()
    if not information:
        return None
    question_related = db.query(Questions).filter(Questions.lesson_id==information.id).all()
    for i in question_related:
        lst.append( {
            "question_name": i.question_name,
            "lesson_id": i.lesson_id
        })
    return lst


def answer_an_question(answer_id:int,questions_id:int,lesson_id:int,db:Session):
    lesson_location = db.query(Lessons).filter(Lessons.id==lesson_id).first()
    if not lesson_location:
        return 1
    question_location = db.query(Questions).filter(Questions.id==questions_id,Questions.lesson_id==lesson_location.id).first()
    if not question_location:
        return 2
    information = db.query(Answers).filter(Answers.id==answer_id,question_location.id==questions_id).first()
    if not information:
        return 3
    return information.correctness
