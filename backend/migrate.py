"""Apply tracked schema changes without importing or replacing banking data."""
from .database import initialize
if __name__ == '__main__':
    applied = initialize()
    print('Applied: '+(', '.join(applied) if applied else 'schema already current'))
