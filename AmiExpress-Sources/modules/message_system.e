MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass','exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores',
       'devices/console','devices/serial','graphics/view','gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens','dos/datetime',
       'dos/dostags','graphics/text','libraries/diskfont','diskfont','devices/timer','exec/io','exec/tasks','amigalib/io','amigalib/ports',
       'icon','workbench/workbench','commodities','exec/libraries','exec/lists','libraries/commodities','asl','workbench/startup','rexx/storage',
       'rexxsyslib','libraries/asl','devices/serial','xproto','xpr_lib','socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio',
       'libraries/asyncio'

  MODULE '*axcommon','*axconsts','*axenums','*axobjects','*miscfuncs','*stringlist','*ftpd','*httpd','*errors','*mailssl','*zmodem',
         '*xymodem','*hydra','*bcd','*pwdhash','*sha256','*tooltypes','*expversion'

/* Message System Module - Handles all message-related operations */

PROC loadMessageHeader(msgNum, conf)
  /* Load message header from disk */
ENDPROC

PROC loadMsg(msgNum, conf)
  /* Load full message from disk */
ENDPROC

PROC loadMsgPointers(conf)
  /* Load message pointers for conference */
ENDPROC

PROC saveMessageHeader(msgHeader, conf)
  /* Save message header to disk */
ENDPROC

PROC saveMsg(msg, conf)
  /* Save full message to disk */
ENDPROC

PROC saveMsgPointers(conf)
  /* Save message pointers for conference */
ENDPROC

PROC saveNewMSG(msg, conf)
  /* Save new message */
ENDPROC

PROC saveOverHeader(msgHeader, conf)
  /* Save message header with overwrite */
ENDPROC

PROC msgToHeader(msg)
  /* Convert message to header format */
ENDPROC

PROC processMessages()
  /* Process message queue */
ENDPROC

PROC processMci(msg)
  /* Process MCI codes in message */
ENDPROC

PROC processMciCmd(cmd)
  /* Process MCI command */
ENDPROC

PROC checkMailConfScan(conf, msgBase)
  /* Check mail conference scan */
ENDPROC

PROC checkFileConfScan(conf)
  /* Check file conference scan */
ENDPROC

PROC conferenceAccounting(conf)
  /* Handle conference accounting */
ENDPROC

PROC conferenceMaintenance(conf)
  /* Handle conference maintenance */
ENDPROC

PROC confScan()
  /* Scan conferences */
ENDPROC

PROC qwkZoom()
  /* QWK zoom function */
ENDPROC

PROC qwkZoomConf()
  /* QWK zoom conference */
ENDPROC