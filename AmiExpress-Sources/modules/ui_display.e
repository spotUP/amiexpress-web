MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass','exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores',
       'devices/console','devices/serial','graphics/view','gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens','dos/datetime',
       'dos/dostags','graphics/text','libraries/diskfont','diskfont','devices/timer','exec/io','exec/tasks','amigalib/io','amigalib/ports',
       'icon','workbench/workbench','commodities','exec/libraries','exec/lists','libraries/commodities','asl','workbench/startup','rexx/storage',
       'rexxsyslib','libraries/asl','devices/serial','xproto','xpr_lib','socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio',
       'libraries/asyncio'

  MODULE '*axcommon','*axconsts','*axenums','*axobjects','*miscfuncs','*stringlist','*ftpd','*httpd','*errors','*mailssl','*zmodem',
         '*xymodem','*hydra','*bcd','*pwdhash','*sha256','*tooltypes','*expversion'

/* UI Display Module - Handles all user interface and display operations */

PROC openExpressScreen()
  /* Open main BBS screen */
ENDPROC

PROC closeExpressScreen()
  /* Close main BBS screen */
ENDPROC

PROC openTransferStatWin()
  /* Open transfer statistics window */
ENDPROC

PROC closeTransferStatWin()
  /* Close transfer statistics window */
ENDPROC

PROC openZmodemStat()
  /* Open Zmodem statistics */
ENDPROC

PROC closezModemStats()
  /* Close Zmodem statistics */
ENDPROC

PROC openHydraStat()
  /* Open Hydra statistics */
ENDPROC

PROC closeHydraStats()
  /* Close Hydra statistics */
ENDPROC

PROC closeAEStats()
  /* Close AE statistics */
ENDPROC

PROC initStatCon()
  /* Initialize statistics console */
ENDPROC

PROC initZmodemStatCon()
  /* Initialize Zmodem statistics console */
ENDPROC

PROC initHydraStatCon()
  /* Initialize Hydra statistics console */
ENDPROC

PROC saveStatOnly()
  /* Save statistics only */
ENDPROC

PROC saveIPAddr()
  /* Save IP address */
ENDPROC

PROC loadA4(taskID, tasktable)
  /* Load A4 register */
ENDPROC

PROC saveA4(taskID, tasktable)
  /* Save A4 register */
ENDPROC

PROC translateText(text)
  /* Translate text */
ENDPROC

PROC translateWord(word)
  /* Translate word */
ENDPROC

PROC translateShortcut(shortcut)
  /* Translate shortcut */
ENDPROC

PROC loadTranslators()
  /* Load translators */
ENDPROC

PROC loadTranslator()
  /* Load translator */
ENDPROC

PROC loadShortcuts()
  /* Load shortcuts */
ENDPROC

PROC unloadTranslators()
  /* Unload translators */
ENDPROC

PROC udLog()
  /* UD log */
ENDPROC

PROC udLogDivider()
  /* UD log divider */
ENDPROC

PROC saveAttachList()
  /* Save attach list */
ENDPROC

PROC saveHistory()
  /* Save history */
ENDPROC

PROC loadHistory()
  /* Load history */
ENDPROC

PROC loadFlagged()
  /* Load flagged */
ENDPROC

PROC saveFlagged()
  /* Save flagged */
ENDPROC

PROC saveConfDB()
  /* Save conference database */
ENDPROC

PROC loadConfDB()
  /* Load conference database */
ENDPROC