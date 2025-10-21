MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass','exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores',
       'devices/console','devices/serial','graphics/view','gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens','dos/datetime',
       'dos/dostags','graphics/text','libraries/diskfont','diskfont','devices/timer','exec/io','exec/tasks','amigalib/io','amigalib/ports',
       'icon','workbench/workbench','commodities','exec/libraries','exec/lists','libraries/commodities','asl','workbench/startup','rexx/storage',
       'rexxsyslib','libraries/asl','devices/serial','xproto','xpr_lib','socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio',
       'libraries/asyncio'

  MODULE '*axcommon','*axconsts','*axenums','*axobjects','*miscfuncs','*stringlist','*ftpd','*httpd','*errors','*mailssl','*zmodem',
         '*xymodem','*hydra','*bcd','*pwdhash','*sha256','*tooltypes','*expversion'

/* Network Communication Module - Handles all network and communication operations */

PROC openSerial()
  /* Open serial port */
ENDPROC

PROC closeSerial()
  /* Close serial port */
ENDPROC

PROC openTimer()
  /* Open timer device */
ENDPROC

PROC closeTimer()
  /* Close timer device */
ENDPROC

PROC waitSerialRead()
  /* Wait for serial read */
ENDPROC

PROC waitSocketLib(leaveOpen)
  /* Wait for socket library */
ENDPROC

PROC checkTelnetConnection()
  /* Check telnet connection */
ENDPROC

PROC checkTelnetData()
  /* Check telnet data */
ENDPROC

PROC telnetConnect()
  /* Telnet connect */
ENDPROC

PROC telnetSend()
  /* Telnet send */
ENDPROC

PROC modemOffHook()
  /* Modem off hook */
ENDPROC

PROC checkCarrier()
  /* Check carrier */
ENDPROC

PROC checkIncomingCall()
  /* Check incoming call */
ENDPROC

PROC checkForCallerId()
  /* Check caller ID */
ENDPROC

PROC checkBaudCallingTime()
  /* Check baud calling time */
ENDPROC

PROC serialErrorReport()
  /* Serial error report */
ENDPROC

PROC checkSer()
  /* Check serial */
ENDPROC

PROC checkCon()
  /* Check connection */
ENDPROC

PROC waitMsg()
  /* Wait for message */
ENDPROC

PROC waitTime()
  /* Wait for time */
ENDPROC

PROC checkShutDown()
  /* Check shutdown */
ENDPROC