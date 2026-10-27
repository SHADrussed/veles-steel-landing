"""Local QA only: memory-backed worksheet, no Google credentials or network calls."""
from api.main import app, worksheet


class MemoryWorksheet:
    def __init__(self):
        self.rows = []

    def append_row(self, row, **kwargs):
        self.rows.append(row)


ws = MemoryWorksheet()
app.dependency_overrides[worksheet] = lambda: ws
