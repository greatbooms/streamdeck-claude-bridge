import pytest
from bridge.injector import key_sequence


def test_first_option_is_just_enter():
    assert key_sequence(1) == "\r"

def test_third_option_two_downs_then_enter():
    assert key_sequence(3) == "\x1b[B\x1b[B\r"

def test_index_must_be_positive():
    with pytest.raises(ValueError):
        key_sequence(0)
