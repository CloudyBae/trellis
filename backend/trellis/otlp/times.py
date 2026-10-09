NANOS_PER_MILLISECOND = 1_000_000


def nano_to_ms(nanos: int | None) -> int:
    if not nanos:
        return 0
    quotient = abs(nanos) // NANOS_PER_MILLISECOND
    return -quotient if nanos < 0 else quotient
