import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'role_workspace.dart';

String ticketQrToken(String value, String origin) {
  final url = Uri.tryParse(value);
  if (url == null ||
      !url.hasAuthority ||
      url.origin != origin ||
      url.path != '/verify') {
    throw const FormatException('This is not a Smart Traffic ticket QR.');
  }
  final token = Uri.splitQueryString(url.fragment)['token'] ??
      url.queryParameters['token'];
  if (token == null || !RegExp(r'^[a-f0-9]{64}$').hasMatch(token)) {
    throw const FormatException('Invalid ticket QR. Use manual verification.');
  }
  return token;
}

class IssuedTicketQr extends StatefulWidget {
  const IssuedTicketQr({required this.api, required this.ticketId, super.key});
  final AccountApi api;
  final String ticketId;
  @override
  State<IssuedTicketQr> createState() => _IssuedTicketQrState();
}

class _IssuedTicketQrState extends State<IssuedTicketQr> {
  Map<String, dynamic>? qr;
  String error = '';
  bool busy = false;
  @override
  void initState() {
    super.initState();
    generate();
  }

  Future<void> generate() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final result = await widget.api('/tickets/${widget.ticketId}/qr', {});
      if (mounted) {
        setState(() {
          qr = Map<String, dynamic>.from(result);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Text(error, semanticsLabel: 'QR error: $error'),
        if (qr != null) ...[
          Semantics(
              label: 'Enlarge ticket QR',
              button: true,
              child: InkWell(
                onTap: () => showDialog<void>(
                    context: context,
                    builder: (context) => AlertDialog(
                          title: Text(qr!['displayReference']),
                          content: Image.memory(
                              base64Decode(
                                  (qr!['qrImage'] as String).split(',').last),
                              fit: BoxFit.contain),
                          actions: [
                            TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('Close'))
                          ],
                        )),
                child: Image.memory(
                    base64Decode((qr!['qrImage'] as String).split(',').last),
                    width: 240,
                    height: 240,
                    semanticLabel: 'Ticket verification QR'),
              )),
          Text('Valid until ${DateTime.parse(qr!['expiresAt']).toLocal()}'),
          const Text('The motorist must sign in to their linked account.'),
          Wrap(spacing: 8, children: [
            OutlinedButton(
                onPressed: () async {
                  await Clipboard.setData(
                      ClipboardData(text: qr!['verificationUrl']));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text(
                            'QR link copied. Share it with the motorist.')));
                  }
                },
                child: const Text('Copy QR link')),
            OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        setState(() {
                          busy = true;
                        });
                        try {
                          await widget
                              .api('/tickets/${widget.ticketId}/qr/revoke', {});
                          if (mounted) {
                            setState(() {
                              qr = null;
                            });
                          }
                        } catch (e) {
                          if (mounted) {
                            setState(() {
                              error = e.toString();
                            });
                          }
                        } finally {
                          if (mounted) {
                            setState(() {
                              busy = false;
                            });
                          }
                        }
                      },
                child: const Text('Revoke QR')),
          ]),
        ],
        OutlinedButton(
            onPressed: busy ? null : generate,
            child: Text(qr == null
                ? 'Generate ticket QR'
                : 'Replace QR (revokes previous)')),
      ]);
}

class TicketScannerScreen extends StatefulWidget {
  const TicketScannerScreen({required this.api, super.key});
  final AccountApi api;
  @override
  State<TicketScannerScreen> createState() => _TicketScannerScreenState();
}

class _TicketScannerScreenState extends State<TicketScannerScreen>
    with WidgetsBindingObserver {
  final scanner = MobileScannerController(
      autoStart: false, formats: [BarcodeFormat.qrCode]);
  bool active = false, busy = false;
  String error = '';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      scanner.stop();
      if (mounted) {
        setState(() {
          active = false;
        });
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    scanner.dispose();
    super.dispose();
  }

  Future<void> verify(String value) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
      active = false;
    });
    await scanner.stop();
    try {
      final config = await widget.api('/public/ticket-qr/config');
      if (config['origin'] == null) {
        throw Exception(
            'QR verification is unavailable. Use manual ticket verification.');
      }
      final token = ticketQrToken(value, config['origin']);
      final ticket =
          await widget.api('/motorist/ticket-qr/verify', {'token': token});
      if (mounted) Navigator.pop(context, ticket['reference'] as String);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  Future<void> photo() async {
    setState(() {
      error = '';
    });
    try {
      final image = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (image == null || !mounted) return;
      if (await image.length() > 10 * 1024 * 1024) {
        throw Exception('Choose an image smaller than 10 MB.');
      }
      final capture = await scanner.analyzeImage(image.path);
      final values =
          capture?.barcodes.map((b) => b.rawValue).whereType<String>();
      if (values == null || values.isEmpty) {
        throw Exception(
            'No readable QR found. Choose another image or use manual verification.');
      }
      await verify(values.first);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Scan Ticket QR')),
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(20), children: [
          const Text(
              'Scan a ticket issued to your account, or choose a QR image. Scanning does not link another person’s ticket to your account.'),
          const SizedBox(height: 16),
          SizedBox(
              height: active ? 300 : 1,
              child: ClipRect(
                  child: MobileScanner(
                controller: scanner,
                onDetect: (capture) {
                  final codes = capture.barcodes
                      .map((b) => b.rawValue)
                      .whereType<String>();
                  if (active && codes.isNotEmpty) verify(codes.first);
                },
                errorBuilder: (context, error) => const Center(
                    child: Text(
                        'Camera unavailable or permission denied. Choose an image or use manual verification.')),
              ))),
          if (busy) const LinearProgressIndicator(),
          if (error.isNotEmpty)
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(error,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error))),
          FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      try {
                        await scanner.start();
                        if (mounted) {
                          setState(() {
                            active = true;
                            error = '';
                          });
                        }
                      } catch (_) {
                        if (mounted) {
                          setState(() {
                            error =
                                'Camera unavailable or permission denied. Choose an image or use manual verification.';
                          });
                        }
                      }
                    },
              child: const Text('Start camera')),
          OutlinedButton(
              onPressed: busy ? null : photo,
              child: const Text('Choose QR image')),
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back — use reference and verification code')),
          const Text('Academic Prototype — No real payments or enforcement',
              textAlign: TextAlign.center),
        ])),
      );
}
