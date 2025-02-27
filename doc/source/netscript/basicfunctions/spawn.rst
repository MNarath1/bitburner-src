spawn() Netscript Function
==========================

.. js:function:: spawn(script[, numThreads = 1[, args...]])

    :RAM cost: 2 GB
    :param string script: Filename of script to execute
    :param number numThreads: Number of threads to spawn new script with. Has to be an integer.
    :param args...:
        Additional arguments to pass into the new script that is being run.

    Terminates the current script, and then after a delay of about 10 seconds it
    will execute the newly-specified script. The purpose of this function is to
    execute a new script without being constrained by the RAM usage of the
    current one. This function can only be used to run scripts on the local
    server.

    .. warning:: Running this function with a ``numThreads`` argument of 0 or
                 less will cause a runtime error.

    Example:

    .. code-block:: javascript

        ns.spawn('foo.js', 10, 'foodnstuff', 90); // "run foo.js foodnstuff 90 -t 10" in 10 seconds.
