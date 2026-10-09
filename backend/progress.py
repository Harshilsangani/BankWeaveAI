"""Only high-level operational events; never prompts, source content or chain-of-thought."""
from contextvars import ContextVar
from contextlib import contextmanager
callback=ContextVar('progress_callback',default=None)
cancelled=ContextVar('operation_cancelled',default=None)
completed=ContextVar('completed_stages',default=None)


@contextmanager
def recording():
    # Graph nodes copy context, so share this request's list rather than resetting
    # an immutable ContextVar value inside a child node.
    stages=[]
    token=completed.set(stages)
    try: yield stages
    finally: completed.reset(token)


class OperationCancelled(ValueError): pass


def check_cancelled():
    event=cancelled.get()
    if event is not None and event.is_set(): raise OperationCancelled('Operation cancelled at a safe work boundary.')


def emit(stage,status='complete'):
    check_cancelled()
    stages=completed.get()
    if status=='complete' and stages is not None and stage not in stages:
        stages.append(stage)
    sink=callback.get()
    if sink: sink({'type':'progress','stage':stage,'status':status})
