from pydantic import BaseModel, ConfigDict, Field, StrictInt


class WritingTopic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=600)
    min_words: StrictInt = Field(ge=20, le=400)
    checklist: list[str] = Field(default_factory=list, max_length=6)


class WritingCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=40)
    score: StrictInt = Field(ge=0, le=10)
    comment: str = Field(default="", max_length=400)


class WritingCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original: str = Field(default="", max_length=400)
    corrected: str = Field(default="", max_length=400)
    issue: str = Field(default="", max_length=300)


class WritingEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall: StrictInt = Field(ge=0, le=10)
    criteria: list[WritingCriterion] = Field(min_length=4, max_length=6)
    summary: str = Field(min_length=1, max_length=800)
    corrections: list[WritingCorrection] = Field(default_factory=list, max_length=12)
    natural_version: str = Field(default="", max_length=2500)
    next_step: str = Field(default="", max_length=500)
