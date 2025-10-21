MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass','exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores',
       'devices/console','devices/serial','graphics/view','gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens','dos/datetime',
       'dos/dostags','graphics/text','libraries/diskfont','diskfont','devices/timer','exec/io','exec/tasks','amigalib/io','amigalib/ports',
       'icon','workbench/workbench','commodities','exec/libraries','exec/lists','libraries/commodities','asl','workbench/startup','rexx/storage',
       'rexxsyslib','libraries/asl','devices/serial','xproto','xpr_lib','socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio',
       'libraries/asyncio'

  MODULE '*axcommon','*axconsts','*axenums','*axobjects','*miscfuncs','*stringlist','*ftpd','*httpd','*errors','*mailssl','*zmodem',
         '*xymodem','*hydra','*bcd','*pwdhash','*sha256','*tooltypes','*expversion'

/* Session Management Module - Handles session state and processing */

PROC processCommand()
  /* Process user command */
ENDPROC

PROC processInternalCommand()
  /* Process internal command */
ENDPROC

PROC processInputMessage()
  /* Process input message */
ENDPROC

PROC processAwait()
  /* Process await state */
ENDPROC

PROC processRexxMessage()
  /* Process REXX message */
ENDPROC

PROC processWindowMessage()
  /* Process window message */
ENDPROC

PROC processWinMessage2()
  /* Process window message 2 */
ENDPROC

PROC processCommodityMessage()
  /* Process commodity message */
ENDPROC

PROC processOlmMessageQueue()
  /* Process OLM message queue */
ENDPROC

PROC processSysCommand()
  /* Process system command */
ENDPROC

PROC handleMenuPick(menuCode)
  /* Handle menu pick */
ENDPROC

PROC handleIemsi()
  /* Handle IEMSI */
ENDPROC

PROC handleLCFiles()
  /* Handle LC files */
ENDPROC

PROC checkInput()
  /* Check input */
ENDPROC

PROC checkForPause()
  /* Check for pause */
ENDPROC

PROC checkScreenClear()
  /* Check screen clear */
ENDPROC

PROC checkRatiosAndTime()
  /* Check ratios and time */
ENDPROC

PROC checkTimeUsed()
  /* Check time used */
ENDPROC

PROC updateTimeUsed()
  /* Update time used */
ENDPROC

PROC checkChanges()
  /* Check changes */
ENDPROC

PROC checkOurList()
  /* Check our list */
ENDPROC

PROC checkToForward()
  /* Check to forward */
ENDPROC

PROC checkDoorMsg()
  /* Check door message */
ENDPROC

PROC checkFlagged()
  /* Check flagged */
ENDPROC

PROC checkNEdit()
  /* Check N edit */
ENDPROC

PROC checkOffhookFlag()
  /* Check offhook flag */
ENDPROC

PROC updateMenus()
  /* Update menus */
ENDPROC

PROC updateTitle()
  /* Update title */
ENDPROC

PROC updateLineLen()
  /* Update line length */
ENDPROC

PROC updateDownloadStats()
  /* Update download stats */
ENDPROC

PROC updateZDisplay()
  /* Update Z display */
ENDPROC

PROC updateVersion(expVer, expDate)
  /* Update version */
ENDPROC

PROC calcEfficiency(cps, baud)
  /* Calculate efficiency */
ENDPROC

PROC calcAffected()
  /* Calculate affected */
ENDPROC

PROC calcConfBad()
  /* Calculate conference bad */
ENDPROC

PROC calcSizeText()
  /* Calculate size text */
ENDPROC

PROC configFileExists(fname)
  /* Check if config file exists */
ENDPROC

PROC who()
  /* Who command */
ENDPROC

PROC vote()
  /* Vote */
ENDPROC

PROC voteMenu()
  /* Vote menu */
ENDPROC

PROC chat()
  /* Chat */
ENDPROC

PROC tranChat()
  /* Transfer chat */
ENDPROC

PROC topicVote()
  /* Topic vote */
ENDPROC

PROC doorLog()
  /* Door log */
ENDPROC

PROC yesNo()
  /* Yes/No prompt */
ENDPROC

PROC noMorePlus()
  /* No more plus */
ENDPROC

PROC noMoreMinus()
  /* No more minus */
ENDPROC

PROC zippy()
  /* Zippy */
ENDPROC

PROC checklist()
  /* Checklist */
ENDPROC

PROC uucpNumberInput()
  /* UUCP number input */
ENDPROC