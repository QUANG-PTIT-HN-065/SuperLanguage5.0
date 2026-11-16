from sqlalchemy.orm import sessionmaker,declarative_base
from sqlalchemy import create_engine

DATABASE_URL = "mysql+pymysql://root:04122007@localhost:3306/vocab_db"

engine = create_engine(DATABASE_URL)
LocalSession = sessionmaker(autoflush=False,bind= engine)

Base = declarative_base()