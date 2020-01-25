---
title: Linux tools – developer's basics
url: linux-tools-basics
id: 21
tags:
  - linux
  - shell
author: Damian Terlecki
date: 2020-01-12T20:00:00
---

When the project hits the maintenance phase it usually means that the system is already operating in a production environment and the main development phase has been finished. During this period and especially in its early stages, the focus changes from delivering new features to fixing bugs and implementing overlooked edge cases. These might be an effect of data flows that were not fully simulated during testing to match the production data. These cases may be hard to reproduce especially when the information coming from the bug report is not detailed enough.

Implementing proper **logging** inside the application allows future maintainers to quickly identify the source of the problems. Even at later phases, it's much easier to provide business support for complex projects when additional systems are getting integrated. But to make full use of logging it's crucial to have a solution for indexing and searching through logs. One popular choice here is the **ELK** stack (E – Elasticsearch, L – Logstash, K – Kibana). This combination provides a way to aggregate logs from different sources, transform them to JSON format, search, filter and visualize.

## Unix tools on Windows

Sometimes we might not be lucky to have such a solution at hand, or maybe the situation requires **looking at the raw logs**. In such a case, everything you might need is a Linux environment or just some basic tools it provides. If you're running Windows – all is not lost yet. You most likely have installed a Git. During the installation, you get prompted for the optional installation of Unix tools. If you haven't checked that – you can still update your Git by running the newest version installer without any side effects.

<img src="/img/hq/git-unix-tools.png" alt="Installation of Unix tools with Git" title="Installation of Unix tools with Git">

I use the third option, but as the warning says, it can cause different behavior than the default (Windows one) due to overriding some of the commands. In case you detect a problem (for quite some time I haven't encountered any yet) you can just remove them from the *PATH*, but if you're still doubtful it's also fine to select the second option. I prefer the third option due to a much better `sort` tool. Another nice thing is that Git Bash shell comes with an SSH so you don't have to install additional clients like PuTTY or WinSCP.

Now we should be able to get into the Bash (it's in the *PATH*):

<img src="data:image/png;base64,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" alt="Run Bash from the address bar in File Explorer" title="Run Bash from the address bar in File Explorer"/>

<img src="data:image/png;base64,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" alt="Git Bash shell on Windows" title="Git Bash shell on Windows"/>

If the remote machine is running a Linux system, you might be tempted to skip this installation. However, depending on the environment, some tasks like data post-processing might be better run on your local machine to reduce the resource usage of the server (disk space, RAM and CPU usage).

## Useful tools and commands

Utilizing the commands and tools introduced below, might not be trivial if you haven't had the chance of interacting with Linux environments, but don't give up. In the long run, mastering them will increase your efficiency greatly. For the time being let's assume the familiarity with some basic commands (`ls`, `cd`, `pwd`) and knowledge of the difference between home directory (`~/` or `/home/username/`) and the root directory (`/`). So, without further ado:

<table class="rwd">
   <thead>
      <tr>
         <th>Commands</th>
         <th>Description</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/ssh">ssh</a> user@hostname</code>
            <blockquote>The authenticity of host (...) can't be established.<br/>RSA key fingerprint is (...)<br/>Are you sure you want to continue connecting (yes/no)?</blockquote>
         </td>
         <td data-label="Description">
            The first time you connect to a remote host you might be prompted with RSA key fingerprint and request for confirmation. <b>Ideally</b>, you should compare this fingerprint with the one you've been provided with to make sure you're not connecting with an imposter.</br></br>
            After that, you will be prompted for a password. If you require an automated (scripted) login, you would need an SSH key or some <a href="https://stackoverflow.com/a/43526842">additional tools</a>.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code>ssh -t user@hostname "top -n 1 | head -n 5"</code>
            <code>ssh -t user@hostname "top -n 1 | head -n 5 > top.log"</code>
            <code><a href="https://explainshell.com/explain?cmd=ssh+-t+user%40hostname+%22top+-n+1+%7C+head+-n+5%22+%3E+top.log">ssh -t user@hostname "top -n 1 | head -n 5" > top.log</a></code>
         </td>
         <td data-label="Description">
            This is a basic way of running command on an SSH server instead of opening the shell. Quotes are used to demark the part which will be run on the remote. Spot the <b>difference</b> between the third and the second command which will result in a log being created <b>locally or on a remote</b>. The <code>-t</code> parameter is used to satisfy the <code>top</code> command which is a screen-based program.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/scp">scp</a> /path/to/file user@hostname:/path/to/destination</code></br>
            <code>scp user@hostname:/path/to/file /path/to/destination</code>
         </td>
         <td data-label="Description">
            SCP program lets you copy files to (the first command) and from a remote (the second one). Be warned that <code>scp</code> will <b>overwrite</b> the files if you have the write permissions.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/gzip">gzip</a></code><br/>
            Example:</br>
            <code><a href="https://explainshell.com/explain?cmd=ssh+-t+user%40hostname+%27gzip+-c+large_logs.txt%27+%7C+gzip+-cd">ssh -t user@hostname 'gzip -c large_logs.txt' | gzip -cd</a></code>
         </td>
         <td data-label="Description">
            A tool to compress the file with an option to write it on a standard output<code>-c</code>. You may want to do that before transferring it over SSH to lower the size for transfer.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code>[<a href="https://linux.die.net/man/1/zcat" id="zcat">z</a>]<a href="https://linux.die.net/man/1/cat">cat</a></code>
         </td>
         <td data-label="Description">
            Basic command for displaying the contents of the file[s] to the standard output. With <code>z</code> prefix, it supports compressed files (e.g. <code>zcat logs.gz</code>). Together with other z-prefixed commands, it may use <code>/tmp</code> directory to perform the operation and as other commands, it also supports <a href="#glob">glob patterns</a>.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code>[<a href="https://linux.die.net/man/1/zdiff">z</a>]<a href="https://linux.die.net/man/1/diff">diff</a></code>
         </td>
         <td data-label="Description">
            Compares files line by line and supports multiple parameters. If you want to compare the lines regardless of their order in a file or json lines this tool might not be sufficient. <a href="#awk">Awk</a> and <a href="#jq">Jq</a> might do a better job here.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code>[<a href="https://linux.die.net/man/1/zgrep">z</a>][e|f]<a href="https://linux.die.net/man/1/grep">grep</a></code><br/>
            Example (ignore case, include 10 preceding and 20 following lines):<br/>
            <code>zgrep -i -B 10 -A 20 'error' logs.gz</code>
         </td>
         <td data-label="Description">
            This is probably <b>the most popular tool</b> to search through a file for a pattern in line. The differences between grep variations are subtle:
            <ul>
               <li><code>fgrep</code>/<code>grep -F</code> – does not recognize REGEX;</li>
               <li><code>egrep</code>/<code>grep -E</code> – recognizes and doesn't require escaping REGEX;</li>
               <li><code>grep</code> – recognizes and requires escaping REGEX.</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code>[<a href="https://linux.die.net/man/1/zless" id="zless">z</a>]<a href="https://linux.die.net/man/1/less">less</a></code>
         </td>
         <td data-label="Description">
            Similar to <code><a href="#zcat">[z]cat</a></code> – displays contents of a file but in a format that fits the screen. The program allows for scrolling and provides a lot of commands. It is useful for an on-the-fly search of a request by e.g. client id and then looking up associated response unknown number of lines below. For a multi-file it can be done as follows:
            <ol>
               <li><code>zless 2020-01-0[1-9].log.gz</code>.</li>
               <li>Press <code>ESC</code>, type <code>/pattern</code>, press <code>Enter</code>.</li>
               <li>Press <code>ESC</code> and <code>n</code> after that to repeat.</li>
            </ol>
         </td>
      </tr>
      <tr>
         <td data-label="Commands">
            <code>[z<a href="https://gist.github.com/brwnj/5536490">(1)</a><a href="http://lptms.u-psud.fr/wiki/index.php/Working_with_compressed_files">(2)</a>]<a href="https://linux.die.net/man/1/head">head</a></code><br/>
            <code>[z]<a href="https://linux.die.net/man/1/tail">tail</a></code>
         </td>
         <td data-label="Description">
            These two command show first/last <code>-n</code> lines of a file. They might come handy to check the dates of logs for unnamed/concatenated files.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/cut">cut</a></code><br/>
            Examples (1st prints <i>b</i>, 2nd: <i>b c</i>):<br/>
            <code>echo "a b c" | cut -d" " -f2</code><br/>
            <code>echo "a b c" | cut -d" " -f2-</code><br/>
         </td>
         <td data-label="Description">
            Useful for extracting selected columns split by a specific delimiter.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/tr">tr</a></code><br/>
            An example which translates <i>abc</i> to <i>dbc</i>:<br/>
            <code>echo "abc" | tr a d</code><br/>
         </td>
         <td data-label="Description">
            A tool for replacing or removing <code>-d</code> characters.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/sort">sort</a></code>
         </td>
         <td data-label="Description">
            A basic command to sort lines. Supports many cases like dictionary sort <code>-d</code> and numeric sort <code>n</code>.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/uniq">uniq</a></code>
         </td>
         <td data-label="Description">
            With input usually piped from the <code>sort</code> command, displays distinct lines, allows for counting occurrences <code>-c</code> and displaying only unique lines <code>-u</code>.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/xargs">xargs</a></code><br/>
            Example:
            <code><a href="https://explainshell.com/explain?cmd=find+%2Ftmp+-name+log+-type+f+-print+%7C+xargs+%2Fbin%2Frm+-f">find /tmp -name log -type f -print | xargs /bin/rm -f</a></code>
         </td>
         <td data-label="Description">
            Allows for building commands from the standard input which is one of the ways in which you could automate the case mentioned during <code><a href="#zless">zless</a></code> description.
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/split">split</a></code><br/>
         </td>
         <td data-label="Description">
            Can be used to split a text file into smaller ones based on number of lines <code>-l</code> or size <code>-b</code> (e.g. <code>split log.txt -b 200MB</code>).
         </td>
      </tr>
      <tr>
         <td data-label="Command">
            <code><a href="https://linux.die.net/man/1/sed">sed</a></code><br/>
            <code><a href="https://linux.die.net/man/1/awk" id="awk">awk</a></code><br/>
            <code><a href="https://stedolan.github.io/jq/" id="jq">jq</a></code>
         </td>
         <td data-label="Description">
            These three tools are more sophisticated and unless you have to process some data, you probably won't need them, which is why I won't go more into detail about them.<br/>
            <b>Sed</b> is a stream editor that provides an easy way to transform text lines – <code>sed 's/original/replacement/g' log.txt</code> is an example of text a replacement.<br/>
            <b>Awk</b> is more of a scripting language which resolves similar problems but is much more powerful.<br/>
            <b>Jq</b> is usually not a part of a Linux distro but it excels best in processing JSON files.
         </td>
      </tr>
      <tr>
         <td data-label="Commands">
            <ol>
               <li>
                  <code><a href="https://linux.die.net/man/1/nproc">nproc</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/top">top</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/du">du</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/free">free</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/ps">ps</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/vmstat">vmstat</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/iostat">iostat</a></code>
               </li>
               <li>
                  <code>ls <a href="https://linux.die.net/man/5/proc">/proc</a></code>
               </li>
               <li>
                  <code><a href="https://linux.die.net/man/1/kill">kill</a></code>
               </li>
            </ol>
         </td>
         <td data-label="Description">
            The last group of tools that might not be that useful for software developers but are critical for <b>maintainers</b> and <b>performance engineers</b>:
            <ol>
               <li>
                  Returns the number of available processing units – useful for parallelizing scripts.
               </li>
               <li>
                  Displays resource usage per process. Press <code>e</code> several times to change the unit scale. This allows us to check which process is eating all of our resources.
               </li>
               <li>
                  Prints file space usage, <code>-h</code> displays units in a human-readable format, <code>-a</code> includes other files besides directories.
               </li>
               <li>
                  Displays free and used memory with <code>-h</code> in a human-readable format – a quick way to check if we are running out of memory.
               </li>
               <li>
                  Reports a snapshot of currently running processes, more detailed with <code>-aux</code> parameters.
               </li>
               <li>
                  Returns virtual memory statistics (parameter <code>1</code> enables ongoing output), useful for starting the performance analysis – context switching or time spent in the user space.
               </li>
               <li>
                  Pseudo file-system which provides an interface for kernel data structures. From this, you can display some useful information like <code>cat /proc/cpuinfo</code>.
               </li>
               <li>
                  A useful command to terminate a process (identified by id from <code>ps</code>) use <code>-9</code> as a last resort as it doesn't give the process a time to clean up.
               </li>
            </ol>
         </td>
      </tr>
   </tbody>
</table>

### Glob

With most of the commands that can have multiple files as input, you can use [glob patterns](https://en.wikipedia.org/wiki/Glob_(programming)). They might look similar but don't mistake them for *REGEX*.
These patterns use wildcards <code>*</code>, <code>?</code>, and <code>[…]</code> making our lives a bit easier. It's useful for multi-node servers, especially when there is a shared directory or in general when we just want to search through multiple files.

### Piping and redirection

Every program you run in the shell may have 3 streams *STDIN*, *STDOUT* and *STDERR*. The following symbols allow for:
- `>` an output redirection to a file
- `>>` an output appendance to a file
- `<` an input from a file
- `2>` an error redirection to a file
- `|` an output redirection to another program

### History

One final tip for situations where you maybe have multiple environments with different applications and might forget the location of the directory where logs are stored or a specific command. There is usually a Bash history saved in a <code>~/.bash_history</code> accessible using <code>history</code> command. You can check it for the recent commands, maybe something will ring the bell.

## Summary

Learning Unix tools cannot be considered as a waste of time. The number of situations they might come handy is enormous and it includes:
- finding more details attached to the logs based on some id/exception/timestamp
- downloading log files from a remote server for complex local processing
- processing data into the desired format
- comparing two files and computing unison or difference
- preparing some simple statistics (e.g. error occurrence)
- quickly searching through compressed log files
- displaying parts of the file which might be hard to load at once in an editor
- aggregating logs from different services/nodes/servers
- getting by on the environments with no access to any advanced tools

If you find yourself repeating some sequences of actions, it's might be a good indication that they can be automated and extracted into a script.
