MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass','exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores',
       'devices/console','devices/serial','graphics/view','gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens','dos/datetime',
       'dos/dostags','graphics/text','libraries/diskfont','diskfont','devices/timer','exec/io','exec/tasks','amigalib/io','amigalib/ports',
       'icon','workbench/workbench','commodities','exec/libraries','exec/lists','libraries/commodities','asl','workbench/startup','rexx/storage',
       'rexxsyslib','libraries/asl','devices/serial','xproto','xpr_lib','socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio',
       'libraries/asyncio'

  MODULE '*axcommon','*axconsts','*axenums','*axobjects','*miscfuncs','*stringlist','*ftpd','*httpd','*errors','*mailssl','*zmodem',
         '*xymodem','*hydra','*bcd','*pwdhash','*sha256','*tooltypes','*expversion'

/* User Management Module - Handles all user-related operations */

PROC loadAccount(userNum)
  /* Load user account from disk */
ENDPROC

PROC saveAccount(user)
  /* Save user account to disk */
ENDPROC

PROC checkUserPassword(user, password)
  /* Check user password */
ENDPROC

PROC checkUserOnLine(user)
  /* Check if user is online */
ENDPROC

PROC checkOnlineStatus()
  /* Check online status */
ENDPROC

PROC isConfAccessAreaName(user)
  /* Check conference access for user */
ENDPROC

PROC convertAccess()
  /* Convert access levels */
ENDPROC

PROC checkSecurity()
  /* Check security settings */
ENDPROC

PROC checkPasswordStrength(password)
  /* Check password strength */
ENDPROC

PROC checkLockAccounts()
  /* Check locked accounts */
ENDPROC

PROC checkIfNameAllowed(name)
  /* Check if username is allowed */
ENDPROC

PROC initNewUser()
  /* Initialize new user */
ENDPROC

PROC processLogon()
  /* Process user logon */
ENDPROC

PROC processLoggedOnUser()
  /* Process logged on user */
ENDPROC

PROC processLoggingOff()
  /* Process user logging off */
ENDPROC

PROC processSysopLogon()
  /* Process sysop logon */
ENDPROC

PROC processFtpLogon()
  /* Process FTP logon */
ENDPROC

PROC processFtpLoggedOnUser()
  /* Process FTP logged on user */
ENDPROC

PROC userNotes()
  /* Handle user notes */
ENDPROC

PROC writeLogoffLog()
  /* Write logoff log */
ENDPROC

PROC logoffLog()
  /* Handle logoff logging */
ENDPROC

PROC updateAllUsers()
  /* Update all users */
ENDPROC

PROC updateCallerNum()
  /* Update caller number */
ENDPROC

PROC doorMsgLoadAccount()
  /* Load account for door message */
ENDPROC

PROC doorMsgSaveAccount()
  /* Save account for door message */
ENDPROC