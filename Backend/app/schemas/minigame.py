from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt


class MiniGameCardInput(BaseModel):
    word: str = Field(min_length=1, max_length=100)
    meaning: str = Field(min_length=1, max_length=300)
    part_of_speech: str = Field(default="", max_length=60)
    example: str = Field(default="", max_length=500)


class MiniGameEvaluationRequest(BaseModel):
    language: str = Field(min_length=2, max_length=30)
    level: str = Field(default="A1", min_length=2, max_length=10)
    sentence: str = Field(min_length=1, max_length=1000)
    rule_title: str = Field(min_length=1, max_length=160)
    rule_description: str = Field(min_length=1, max_length=600)
    cards: list[MiniGameCardInput] = Field(min_length=1, max_length=4)


class MiniGameEvaluationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: StrictBool
    score: StrictInt = Field(ge=0, le=100)
    grammar_correct: StrictBool
    meaning_correct: StrictBool
    context_appropriate: StrictBool
    reason: str = Field(min_length=1, max_length=500)
    correction: str = Field(default="", max_length=500)
    short_hint: str = Field(default="", max_length=300)
