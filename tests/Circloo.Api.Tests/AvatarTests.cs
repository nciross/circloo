using Circloo.Api.Circles;

namespace Circloo.Api.Tests;

public class AvatarTests
{
    [Theory]
    [InlineData("me:01234567")]
    [InlineData("me:00000000")]
    [InlineData("me:35874373")]
    public void A_built_character_with_every_option_in_range_is_accepted(string id)
    {
        Assert.True(Avatars.IsValid(id));
        Assert.True(Characters.IsKnown(id));
        Assert.True(id.Length <= 16, "must fit the Character column");
    }

    [Theory]
    [InlineData("me:0123456")]      // too short
    [InlineData("me:012345678")]    // too long
    [InlineData("me:40000000")]     // face has 4 options (0-3)
    [InlineData("me:06000000")]     // skin has 6 options (0-5)
    [InlineData("me:00900000")]     // hair has 9 options (0-8)
    [InlineData("me:00080000")]     // hair colour has 8 options (0-7)
    [InlineData("me:00005000")]     // beard has 5 options (0-4)
    [InlineData("me:00000400")]     // glasses has 4 options (0-3)
    [InlineData("me:00000080")]     // outfit has 8 options (0-7)
    [InlineData("me:00000004")]     // mouth has 4 options (0-3)
    [InlineData("me:0000000a")]     // not a digit
    [InlineData("xx:00000000")]     // wrong prefix
    [InlineData("")]
    public void A_malformed_or_out_of_range_character_is_refused(string id)
    {
        Assert.False(Avatars.IsValid(id));
        Assert.False(Characters.IsKnown(id));
    }

    [Fact]
    public void The_anonymous_character_is_part_of_the_cast()
    {
        Assert.True(Characters.IsKnown("anonymous"));
        Assert.False(Characters.IsKnown(null));
    }
}
