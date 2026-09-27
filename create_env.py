import random
import string


def random_word(length: int) -> str:
    letters = string.ascii_letters
    return "".join(random.choice(letters) for _ in range(length))


postgres_user = f"user_{random_word(10)}"
postgres_password = random_word(25)
postgres_database = random_word(10)

with open(".env", "w", encoding="utf-8") as f:
    f.write(
        f"""
POSTGRES_USER={postgres_user}
POSTGRES_PASSWORD={postgres_password}
POSTGRES_DATABASE={postgres_database}
POSTGRES_PORT=5446

NGINX_FILE=local_nginx.conf

"""
    )
