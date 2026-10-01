using Azure.Communication.Email;
using Azure.Identity;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Circloo.Api.Email;

public sealed record EmailMessage(string To, string Subject, string Text, string Html);

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public sealed class EmailOptions
{
    public const string Section = "Email";

    /// <summary>"Smtp" (dev: Mailpit) or "Acs" (prod: Azure Communication Services).</summary>
    public string Provider { get; set; } = "Smtp";
    public string From { get; set; } = "circloo <hello@circloo.local>";
    public string? AcsEndpoint { get; set; }
    public string? AcsConnectionString { get; set; }
}

/// <summary>SMTP sender. In dev the Aspire Mailpit resource provides <c>ConnectionStrings:mailpit</c> (Endpoint=smtp://host:port).</summary>
public sealed class SmtpEmailSender(IConfiguration config, IOptions<EmailOptions> options) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var cs = config.GetConnectionString("mailpit") ?? "Endpoint=smtp://localhost:1025";
        var endpoint = new Uri(cs.Split(';').Select(p => p.Split('=', 2)).First(p => p[0].Equals("Endpoint", StringComparison.OrdinalIgnoreCase))[1]);

        var mime = new MimeMessage();
        mime.From.Add(MailboxAddress.Parse(options.Value.From));
        mime.To.Add(MailboxAddress.Parse(message.To));
        mime.Subject = message.Subject;
        mime.Body = new BodyBuilder { TextBody = message.Text, HtmlBody = message.Html }.ToMessageBody();

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(endpoint.Host, endpoint.Port, SecureSocketOptions.None, ct);
        await smtp.SendAsync(mime, ct);
        await smtp.DisconnectAsync(true, ct);
    }
}

/// <summary>Azure Communication Services Email; prefers managed identity over a connection string.</summary>
public sealed class AcsEmailSender : IEmailSender
{
    private readonly EmailClient _client;
    private readonly string _from;

    public AcsEmailSender(IOptions<EmailOptions> options)
    {
        var o = options.Value;
        _client = o.AcsEndpoint is { Length: > 0 } ep
            ? new EmailClient(new Uri(ep), new DefaultAzureCredential())
            : new EmailClient(o.AcsConnectionString ?? throw new InvalidOperationException("Email:AcsEndpoint or Email:AcsConnectionString is required."));
        _from = MailboxAddress.Parse(o.From).Address;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var content = new EmailContent(message.Subject) { PlainText = message.Text, Html = message.Html };
        await _client.SendAsync(Azure.WaitUntil.Started, new Azure.Communication.Email.EmailMessage(_from, message.To, content), ct);
    }
}
