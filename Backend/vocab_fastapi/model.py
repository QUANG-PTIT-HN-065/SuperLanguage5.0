from sqlalchemy import Column,String,Integer,ForeignKey,Enum,Boolean
from database import Base
from sqlalchemy.orm import relationship
class Language(Base):
    __tablename__ = "languages"
    id = Column(Integer,primary_key=True,autoincrement=True)
    language_name = Column(String(255),nullable=False)
    topics = relationship("Topic",back_populates="language")

class Topic(Base):
    __tablename__ = "topics"
    id = Column(Integer,primary_key=True,autoincrement=True)
    topic_name = Column(String(255),nullable=False)
    language_id = Column(Integer,ForeignKey("languages.id"))
    language = relationship("Language",back_populates="topics")
    wts = relationship("Word_and_topic",back_populates="topics")


class Word(Base):
    __tablename__ = "words"
    id = Column(Integer,primary_key=True,autoincrement=True)
    word_name = Column(String(255),nullable=False)
    hardness_ranking = Column(Enum("easy","normal","hard"))
    wts = relationship("Word_and_topic",back_populates="words")

class Word_and_topic(Base):
    __tablename__ = "word_topics"
    id = Column(Integer,primary_key=True,autoincrement=True)
    words = relationship("Word",back_populates="wts")
    topics = relationship("Topic",back_populates="wts")
    word_id = Column(Integer,ForeignKey("words.id"))
    topic_id = Column(Integer,ForeignKey("topics.id"))

class Lessons(Base):
    __tablename__ = "lessons"
    id = Column(Integer,primary_key=True,autoincrement=True)
    lesson_name = Column(String(255),nullable=False)
    questions  = relationship("Questions",back_populates="lesson")
    unlocked = Column(Boolean,default=False)

class Questions(Base):
    __tablename__ = "questions"
    id = Column(Integer,primary_key=True,autoincrement=True)
    question_name = Column(String(255),nullable=False)
    lesson = relationship("Lessons",back_populates="questions")
    lesson_id = Column(Integer,ForeignKey("lessons.id"))
    answers = relationship("Answers",back_populates="question")

class Answers(Base):
    __tablename__ = "answers"
    id = Column(Integer,primary_key=True,autoincrement=True)
    answer_name = Column(String(255),nullable=False)
    question = relationship("Questions",back_populates="answers")
    question_id = Column(Integer,ForeignKey("questions.id"))
    correctness = Column(Enum("Correct","Wrong"))