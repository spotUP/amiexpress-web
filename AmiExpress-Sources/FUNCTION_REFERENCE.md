# AmiExpress Function Reference

## Overview

This document provides a comprehensive reference of all functions and procedures in the AmiExpress codebase, organized by module and functionality.

## Core Application (express.e)

### Main Entry Point
- `main()` - Main application entry point with exception handling

### Message System Functions
- `loadMessageHeader(msgNum, conf)` - Load message header from disk
- `loadMsg(msgNum, conf)` - Load full message from disk
- `loadMsgPointers(conf)` - Load message pointers for conference
- `saveMessageHeader(msgHeader, conf)` - Save message header to disk
- `saveMsg(msg, conf)` - Save full message to disk
- `saveMsgPointers(conf)` - Save message pointers for conference
- `saveNewMSG(msg, conf)` - Save new message
- `saveOverHeader(msgHeader, conf)` - Save message header with overwrite
- `msgToHeader(msg)` - Convert message to header format
- `processMessages()` - Process message queue
- `processMci(msg)` - Process MCI codes in message
- `processMciCmd(cmd)` - Process MCI command
- `checkMailConfScan(conf, msgBase)` - Check mail conference scan
- `checkFileConfScan(conf)` - Check file conference scan
- `conferenceAccounting(conf)` - Handle conference accounting
- `conferenceMaintenance(conf)` - Handle conference maintenance
- `confScan()` - Scan conferences
- `qwkZoom()` - QWK zoom function
- `qwkZoomConf()` - QWK zoom conference

### User Management Functions
- `loadAccount(userNum)` - Load user account from disk
- `saveAccount(user)` - Save user account to disk
- `checkUserPassword(user, password)` - Check user password
- `checkUserOnLine(user)` - Check if user is online
- `checkOnlineStatus()` - Check online status
- `isConfAccessAreaName(user)` - Check conference access for user
- `convertAccess()` - Convert access levels
- `checkSecurity()` - Check security settings
- `checkPasswordStrength(password)` - Check password strength
- `checkLockAccounts()` - Check locked accounts
- `checkIfNameAllowed(name)` - Check if username is allowed
- `initNewUser()` - Initialize new user
- `processLogon()` - Process user logon
- `processLoggedOnUser()` - Process logged on user
- `processLoggingOff()` - Process user logging off
- `processSysopLogon()` - Process sysop logon
- `processFtpLogon()` - Process FTP logon
- `processFtpLoggedOnUser()` - Process FTP logged on user
- `userNotes()` - Handle user notes
- `writeLogoffLog()` - Write logoff log
- `logoffLog()` - Handle logoff logging
- `updateAllUsers()` - Update all users
- `updateCallerNum()` - Update caller number
- `doorMsgLoadAccount()` - Load account for door message
- `doorMsgSaveAccount()` - Save account for door message

### File Transfer Functions
- `downloadAFile()` - Download a file
- `downloadFile()` - Download file
- `downloadFiles()` - Download multiple files
- `downloadPrompt()` - Download prompt
- `uploadaFile()` - Upload a file
- `uploadDesc()` - Upload description
- `ftpDownload()` - FTP download
- `ftpDownloadFileStart()` - FTP download file start
- `ftpDownloadFileEnd()` - FTP download file end
- `ftpUpload()` - FTP upload
- `ftpUploadFileStart()` - FTP upload file start
- `ftpUploadFileEnd()` - FTP upload file end
- `ftpTransferFileProgress()` - FTP transfer progress
- `ftpAuth()` - FTP authentication
- `ftpCheckRatio()` - FTP check ratio
- `ftpDupeCheck()` - FTP duplicate check
- `ftpFindFile()` - FTP find file
- `ftpGetPath()` - FTP get path
- `ftpStartFileCheck()` - FTP start file check
- `ftpWaitFileCheck()` - FTP wait file check
- `httpDownload()` - HTTP download
- `httpUpload()` - HTTP upload
- `checkFileConfScan(conf)` - Check file conference scan
- `checkForFile()` - Check for file
- `checkForFileSize()` - Check file size
- `checkFIBForFileSize()` - Check FIB for file size
- `checkFileExternal()` - Check external file
- `checkInPlaypens()` - Check playpens
- `checkFree()` - Check free space
- `checkAttachedFile()` - Check attached file
- `viewAFile()` - View a file
- `maintenanceFileSearch()` - File maintenance search
- `maintenanceFileMove()` - File maintenance move
- `maintenanceFileDelete()` - File maintenance delete

### Network Communication Functions
- `openSerial()` - Open serial port
- `closeSerial()` - Close serial port
- `openTimer()` - Open timer device
- `closeTimer()` - Close timer device
- `waitSerialRead()` - Wait for serial read
- `waitSocketLib(leaveOpen)` - Wait for socket library
- `checkTelnetConnection()` - Check telnet connection
- `checkTelnetData()` - Check telnet data
- `telnetConnect()` - Telnet connect
- `telnetSend()` - Telnet send
- `modemOffHook()` - Modem off hook
- `checkCarrier()` - Check carrier
- `checkIncomingCall()` - Check incoming call
- `checkForCallerId()` - Check caller ID
- `checkBaudCallingTime()` - Check baud calling time
- `serialErrorReport()` - Serial error report
- `checkSer()` - Check serial
- `checkCon()` - Check connection
- `waitMsg()` - Wait for message
- `waitTime()` - Wait for time
- `checkShutDown()` - Check shutdown

### Session Management Functions
- `processCommand()` - Process user command
- `processInternalCommand()` - Process internal command
- `processInputMessage()` - Process input message
- `processAwait()` - Process await state
- `processRexxMessage()` - Process REXX message
- `processWindowMessage()` - Process window message
- `processWinMessage2()` - Process window message 2
- `processCommodityMessage()` - Process commodity message
- `processOlmMessageQueue()` - Process OLM message queue
- `processSysCommand()` - Process system command
- `handleMenuPick(menuCode)` - Handle menu pick
- `handleIemsi()` - Handle IEMSI
- `handleLCFiles()` - Handle LC files
- `checkInput()` - Check input
- `checkForPause()` - Check for pause
- `checkScreenClear()` - Check screen clear
- `checkRatiosAndTime()` - Check ratios and time
- `checkTimeUsed()` - Check time used
- `updateTimeUsed()` - Update time used
- `checkChanges()` - Check changes
- `checkOurList()` - Check our list
- `checkToForward()` - Check to forward
- `checkDoorMsg()` - Check door message
- `checkFlagged()` - Check flagged
- `checkNEdit()` - Check N edit
- `checkOffhookFlag()` - Check offhook flag
- `updateMenus()` - Update menus
- `updateTitle()` - Update title
- `updateLineLen()` - Update line length
- `updateDownloadStats()` - Update download stats
- `updateZDisplay()` - Update Z display
- `updateVersion(expVer, expDate)` - Update version
- `calcEfficiency(cps, baud)` - Calculate efficiency
- `calcAffected()` - Calculate affected
- `calcConfBad()` - Calculate conference bad
- `calcSizeText()` - Calculate size text
- `configFileExists(fname)` - Check if config file exists
- `who()` - Who command
- `vote()` - Vote
- `voteMenu()` - Vote menu
- `chat()` - Chat
- `tranChat()` - Transfer chat
- `topicVote()` - Topic vote
- `doorLog()` - Door log
- `yesNo()` - Yes/No prompt
- `noMorePlus()` - No more plus
- `noMoreMinus()` - No more minus
- `zippy()` - Zippy
- `checklist()` - Checklist
- `uucpNumberInput()` - UUCP number input

### UI Display Functions
- `openExpressScreen()` - Open main BBS screen
- `closeExpressScreen()` - Close main BBS screen
- `openTransferStatWin()` - Open transfer statistics window
- `closeTransferStatWin()` - Close transfer statistics window
- `openZmodemStat()` - Open Zmodem statistics
- `closezModemStats()` - Close Zmodem statistics
- `openHydraStat()` - Open Hydra statistics
- `closeHydraStats()` - Close Hydra statistics
- `closeAEStats()` - Close AE statistics
- `initStatCon()` - Initialize statistics console
- `initZmodemStatCon()` - Initialize Zmodem statistics console
- `initHydraStatCon()` - Initialize Hydra statistics console
- `saveStatOnly()` - Save statistics only
- `saveIPAddr()` - Save IP address
- `loadA4(taskID, tasktable)` - Load A4 register
- `saveA4(taskID, tasktable)` - Save A4 register
- `translateText(text)` - Translate text
- `translateWord(word)` - Translate word
- `translateShortcut(shortcut)` - Translate shortcut
- `loadTranslators()` - Load translators
- `loadTranslator()` - Load translator
- `loadShortcuts()` - Load shortcuts
- `unloadTranslators()` - Unload translators
- `udLog()` - UD log
- `udLogDivider()` - UD log divider
- `saveAttachList()` - Save attach list
- `saveHistory()` - Save history
- `loadHistory()` - Load history
- `loadFlagged()` - Load flagged
- `saveFlagged()` - Save flagged
- `saveConfDB()` - Save conference database
- `loadConfDB()` - Load conference database

### Utility Functions
- `calcEfficiency(cps, baud)` - Calculate transfer efficiency
- `configFileExists(fname)` - Check if configuration file exists
- `convertAccess()` - Convert access level formats
- `isConfAccessAreaName(user)` - Check conference access permissions

## ACP (AmiExpress Control Program)

### Main Functions (108 total)
- Main ACP interface and administration functions
- Node management and monitoring
- System configuration and control
- User account administration
- Conference and message management

## Protocol Modules

### ZModem (zmodem.e - 67 procedures)
- ZModem protocol implementation
- File transfer state management
- Error handling and recovery
- Progress tracking and statistics

### X/YModem (xymodem.e - 31 procedures)
- XModem and YModem protocol support
- Basic file transfer operations
- Checksum and CRC validation

### Hydra (hydra.e - 49 procedures)
- Hydra protocol implementation
- High-speed file transfer
- Advanced error correction

## Server Modules

### FTP Server (ftpd.e - 80 procedures)
- FTP protocol implementation
- User authentication
- File operations (upload/download)
- Directory management
- Transfer statistics

### HTTP Server (httpd.e - 27 procedures)
- Basic HTTP server functionality
- Request/response handling
- File serving capabilities

## Utility Modules

### Mail SSL (mailssl.e - 10 procedures)
- SSL/TLS encryption for mail
- Secure communication protocols

### Tool Types (tooltypes.e)
- Configuration file parsing
- ToolType parameter handling

### Password Hash (pwdhash.e)
- Password hashing algorithms
- PBKDF2 implementation
- Legacy password support

### BCD Operations (bcd.e)
- Binary Coded Decimal arithmetic
- Large number handling

### SHA256 (sha256.e - 10 procedures)
- SHA-256 cryptographic hashing
- Secure hash functions

### String List (stringlist.e)
- Dynamic string list management
- Memory allocation and deallocation

### Error Handling (errors.e)
- Error code definitions
- Error reporting functions

### Miscellaneous Functions (MiscFuncs.e)
- Utility functions
- Helper procedures

## Setup Tool Modules (axSetupTool/)

### Main Application (axSetupTool.e)
- GUI setup application entry point

### Form Modules
- `frmMain.e` (25 procedures) - Main application window
- `frmConfEdit.e` (36 procedures) - Conference configuration
- `frmNodeEdit.e` (27 procedures) - Node configuration
- `frmSettingsEdit.e` (20 procedures) - System settings
- `frmEditList.e` (62 procedures) - List editing interface
- `frmAccess.e` - Access permissions
- `frmCommands.e` - Command configuration
- `frmAddComplexItem.e` - Complex item addition
- `frmAddItem.e` - Item addition
- `frmBase.e` - Base form functionality
- `frmTools.e` - Tool configuration

### Support Modules
- `configObject.e` - Configuration object management
- `controls.e` - UI control components
- `helpText.e` - Help system
- `miscfuncs.e` - Miscellaneous functions
- `tooltypes.e` - ToolType handling

## Data Processing Modules

### QWK (qwk.e - 17 procedures)
- QWK offline mail format
- Message packing/unpacking
- Index file handling

### FidoNet (ftn.e - 22 procedures)
- FidoNet mail processing
- Message routing
- Network operations

### JSON Processing
- `jsonParser.e` - JSON parsing
- `jsonCreate.e` - JSON creation
- `jsonImport.e` - JSON import utilities

### Icon Configuration (icon2cfg.e)
- Icon to configuration conversion

## Module Dependencies

### Core Dependencies
```
express.e
├── axcommon.e (shared constants)
├── axconsts.e (system constants)
├── axenums.e (enumerations)
├── axobjects.e (data structures)
├── MiscFuncs.e (utilities)
├── stringlist.e (collections)
├── errors.e (error handling)
├── tooltypes.e (configuration)
├── pwdhash.e (security)
├── bcd.e (arithmetic)
├── sha256.e (crypto)
├── mailssl.e (secure mail)
├── ftpd.e (FTP server)
├── httpd.e (HTTP server)
├── zmodem.e (file transfer)
├── xymodem.e (file transfer)
├── hydra.e (file transfer)
└── qwk.e (offline mail)
```

### External Dependencies
- Amiga system libraries (intuition, dos, exec, etc.)
- Network libraries (bsdsocket, asyncio)
- Protocol libraries (xpr_lib)
- SSL libraries (amissl)

## Function Categories by Count

### Most Common Function Prefixes:
- `check*` (50+ functions) - Validation and status checking
- `update*` (20+ functions) - Data updating and refresh
- `process*` (23 functions) - Message/command processing
- `load*` (24 functions) - Data loading operations
- `save*` (24 functions) - Data saving operations
- `open*` (13 functions) - Resource opening
- `close*` (13 functions) - Resource closing
- `handle*` (3 functions) - Event/message handling
- `init*` (4 functions) - Initialization
- `calc*` (6 functions) - Calculations

This reference provides a complete overview of the AmiExpress function architecture, enabling developers to understand the system's modular organization and locate specific functionality efficiently.