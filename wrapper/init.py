#!/usr/bin/python3 -u
# source: https://github.com/phusion/baseimage-docker/blob/rel-0.9.16/image/bin/my_init
import os, os.path, sys, stat, signal, errno, time, argparse

KILL_PROCESS_TIMEOUT = 10
terminated_child_processes = {}

class AlarmException(Exception):
	pass

def msg(message, new_line = False):
	if new_line:
		sys.stderr.write("\n[ INIT ] %s\n" % message)
	else:
		sys.stderr.write("[ INIT ] %s\n" % message)

def raise_alarm_exception():
	raise AlarmException('Alarm')

# Waits for the child process with the given PID, while at the same time
# reaping any other child processes that have exited (e.g. adopted child
# processes that have terminated).
def waitpid_reap_other_children(pid):
	global terminated_child_processes

	status = terminated_child_processes.get(pid)
	if status:
		# A previous call to waitpid_reap_other_children(),
		# with an argument not equal to the current argument,
		# already waited for this process. Return the status
		# that was obtained back then.
		del terminated_child_processes[pid]
		return status

	done = False
	status = None
	while not done:
		try:
			this_pid, status = os.waitpid(-1, 0)
			if this_pid == pid:
				done = True
			else:
				# Save status for later.
				terminated_child_processes[this_pid] = status
		except OSError as e:
			if e.errno == errno.ECHILD or e.errno == errno.ESRCH:
				return None
			else:
				raise
	return status

def stop_child_process(name, pid, signo = signal.SIGINT, time_limit = KILL_PROCESS_TIMEOUT):
	msg("Shutting down %s (PID %d) with signal(%d)..." % (name, pid, signo), True)
	try:
		os.kill(pid, signo)
	except OSError:
		pass
	signal.alarm(time_limit)
	try:
		try:
			waitpid_reap_other_children(pid)
		except OSError:
			pass
	except AlarmException:
		msg("%s (PID %d) did not shut down in time. Forcing it to exit." % (name, pid))
		try:
			os.kill(pid, signal.SIGKILL)
		except OSError:
			pass
		try:
			waitpid_reap_other_children(pid)
		except OSError:
			pass
	finally:
		signal.alarm(0)

def main(args):	
	exit_code = None
	try:
		exit_status = None
		msg("Running %s..." % " ".join(args.main_command))
		pid = os.spawnvp(os.P_NOWAIT, args.main_command[0], args.main_command)
		try:
			exit_code = waitpid_reap_other_children(pid)
			if exit_code is None:
				msg("%s exited with unknown status." % args.main_command[0])
				exit_status = 1
			else:
				exit_status = os.WEXITSTATUS(exit_code)
				msg("%s exited with status %d." % (args.main_command[0], exit_status))
		except KeyboardInterrupt:
			stop_child_process(args.main_command[0], pid)
			raise
		except BaseException as s:
			msg("An error occurred. Aborting.")
			stop_child_process(args.main_command[0], pid)
			raise
		finally:
			pass
		sys.exit(exit_status)
	finally:
		pass


# Parse options.
parser = argparse.ArgumentParser(description = 'Initialize the system.')
parser.add_argument('main_command', metavar = 'MAIN_COMMAND', type = str, nargs = '*',
	help = 'The main command to run.')
args = parser.parse_args()

if len(args.main_command) == 0:
	msg("You must also pass a main command.")
	sys.exit(1)

# Run main function.
signal.signal(signal.SIGALRM, lambda signum, frame: raise_alarm_exception())
try:
	main(args)
except KeyboardInterrupt:
	msg("Init system aborted.")
	exit(2)
finally:
	pass