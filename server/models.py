from sqlalchemy import Column, Integer, String, Text, ForeignKey, TIMESTAMP, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    filename = Column(Text, nullable=False)
    uploaded_at = Column(TIMESTAMP, server_default=func.now())

    chapters = relationship("Chapter", back_populates="document", cascade="all, delete")

class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"))
    title = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False)

    document = relationship("Document", back_populates="chapters")
    topics = relationship("Topic", back_populates="chapter", cascade="all, delete")

class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"))
    title = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False)
    source_page_start = Column(Integer)
    source_page_end = Column(Integer)

    chapter = relationship("Chapter", back_populates="topics")
    content = relationship("TopicContent", back_populates="topic", uselist=False, cascade="all, delete")

class TopicContent(Base):
    __tablename__ = "topic_content"
    __table_args__ = (UniqueConstraint("topic_id"),)

    id = Column(Integer, primary_key=True)
    topic_id = Column(Integer, ForeignKey("topics.id", ondelete="CASCADE"))
    lecture_text = Column(Text, nullable=False)
    generated_at = Column(TIMESTAMP, server_default=func.now())
    model_version = Column(String)

    topic = relationship("Topic", back_populates="content")