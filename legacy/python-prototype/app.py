import os
import langchain
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

llm = ChatOpenAI(
    api_key = os.environ['DEEPSEEK_API_KEY'],
    model = "deepseek-chat",
    base_url="https://api.deepseek.com"
)


res = llm.invoke(input="nihao")
print(res)